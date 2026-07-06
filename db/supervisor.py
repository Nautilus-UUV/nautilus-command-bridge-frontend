"""Always-idle supervisor: the local listener the UI's Start/Terminate talks to.

An OS process that must be started manually that supervises the db writer.

  start     -> desired = running; (re)spawn writer.py if it isn't alive.
  terminate -> desired = stopped; SIGTERM the writer so it CLOSES the dive.

Two different ways the writer can stop, with deliberately different effects on
the dive:

  * Operator Terminate (desired -> stopped): a graceful SIGTERM. The writer sets
    ended_at and the dive is done.
  * Writer crash, or the supervisor itself going down for a restart: the dive is
    left OPEN (ended_at NULL). A respawn -- automatic on a crash, or the operator
    re-running run.sh after a reboot -- resumes that same open dive (writer.py
    resolves it from the DB).

The writer runs in its own session (start_new_session) so a Ctrl-C in the
supervisor's terminal doesn't reach it directly -- only the supervisor decides
how the writer dies, which is what keeps the two cases above distinct.

Cloud mirror (opt-in, --cloud): the supervisor also keeps an uploader.py child
alive -- but unlike the writer it runs the *whole* session, independent of the
dive's desired state, so it mirrors the rolling parquet to Google Drive during
the dive and still catches the writer's final-minute files after Terminate. See
uploader.py / cloud_auth.py.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
import sys
import threading
import time

import config
import mqtt_source

RESPAWN_BACKOFF_S = 1.0
TERMINATE_GRACE_S = 10.0


class _Child:
    """A respawnable subprocess in its own session. Knows how to (re)spawn with
    backoff and report liveness; the *stop* policy lives in the supervisor,
    because the writer and the uploader stop differently."""

    def __init__(self, name: str, path) -> None:
        self.name = name
        self.path = path
        self.proc: subprocess.Popen | None = None
        self.last_spawn = 0.0

    def alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def due_for_respawn(self, backoff: float) -> bool:
        return not self.alive() and (time.monotonic() - self.last_spawn >= backoff)

    def spawn(self, env_extra: dict | None = None) -> None:
        self.last_spawn = time.monotonic()
        env = {**os.environ, **(env_extra or {})}
        # Own session: terminal signals (Ctrl-C) hit only the supervisor.
        self.proc = subprocess.Popen(
            [sys.executable, str(self.path)],
            cwd=str(config.HERE),
            start_new_session=True,
            env=env,
        )
        print(f"[supervisor] spawned {self.name} pid={self.proc.pid}", flush=True)


class Supervisor:
    def __init__(self, cloud_env: dict | None = None) -> None:
        self._lock = threading.Lock()
        self._desired = "stopped"        # set by control messages
        self._dive_name = ""             # operator-given name, rides the start cmd
        self._writer = _Child("writer", config.WRITER_PATH)
        # cloud off -> no uploader; cloud on -> uploader gets this static env.
        self._cloud_env = cloud_env
        self._uploader = _Child("uploader", config.UPLOADER_PATH) if cloud_env else None
        self._running = True

        self._client = mqtt_source.make_client(
            f"nautilus-db-supervisor-{int(time.time())}",
            on_connect=self._on_connect,
            on_message=self._on_message,
        )

    # --- MQTT ---------------------------------------------------------------

    def _on_connect(self, client, _userdata, _flags, _reason, _props=None) -> None:
        # qos 1 + retained delivery: on (re)connect we get the last desired
        # action, so a relaunched supervisor restores where it left off.
        client.subscribe(config.DB_CONTROL_TOPIC, qos=1)
        print("[supervisor] connected, watching", config.DB_CONTROL_TOPIC, flush=True)

    def _on_message(self, _client, _userdata, msg) -> None:
        try:
            cmd = json.loads(msg.payload.decode("utf-8"))
            action = cmd.get("action")
        except (ValueError, UnicodeDecodeError, AttributeError):
            return
        if action == "start":
            with self._lock:
                self._desired = "running"
                # Name only labels a freshly opened dive; a resume keeps the
                # dive's existing name. The writer applies it on create.
                self._dive_name = str(cmd.get("name") or "")
            print(f"[supervisor] desired = running (name={self._dive_name!r})",
                  flush=True)
        elif action == "terminate":
            with self._lock:
                self._desired = "stopped"
            print("[supervisor] desired = stopped", flush=True)

    # --- writer / uploader lifecycle ----------------------------------------

    def _stop_writer(self, graceful: bool) -> None:
        """Stop the writer, with deliberately different effects on the dive.

        graceful (operator Terminate): SIGTERM so the writer sets ended_at and
        closes the dive; a stuck writer is escalated to SIGKILL after the grace.
        non-graceful (supervisor itself going down): SIGKILL straight away so the
        dive stays OPEN (ended_at NULL) for the next run to resume.
        """
        w = self._writer
        if not w.alive():
            w.proc = None
            return
        if graceful:
            print(f"[supervisor] terminating writer pid={w.proc.pid} (closing dive)",
                  flush=True)
            w.proc.terminate()  # SIGTERM -> writer sets ended_at, exits
        else:
            print(f"[supervisor] killing writer pid={w.proc.pid} (dive stays open)",
                  flush=True)
            w.proc.kill()
        try:
            w.proc.wait(timeout=TERMINATE_GRACE_S)
        except subprocess.TimeoutExpired:
            if graceful:  # escalate a stuck graceful stop to a hard kill
                print("[supervisor] writer didn't exit, killing", flush=True)
                w.proc.kill()
        w.proc = None

    def _stop_uploader(self) -> None:
        """Kill the uploader -- it has no dive state to preserve. Any not-yet-
        mirrored parquet stays on disk and is caught on the next launch."""
        u = self._uploader
        if u is None or not u.alive():
            if u is not None:
                u.proc = None
            return
        print(f"[supervisor] killing uploader pid={u.proc.pid}", flush=True)
        u.proc.kill()
        try:
            u.proc.wait(timeout=TERMINATE_GRACE_S)
        except subprocess.TimeoutExpired:
            pass
        u.proc = None

    # --- reconcile loop -----------------------------------------------------

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self._stop)
        signal.signal(signal.SIGINT, self._stop)
        mqtt_source.start(self._client)

        while self._running:
            with self._lock:
                desired = self._desired
            # The writer follows the operator's desired state.
            if desired == "running":
                if self._writer.due_for_respawn(RESPAWN_BACKOFF_S):
                    with self._lock:
                        name = self._dive_name
                    self._writer.spawn({config.DIVE_NAME_ENV: name})
            else:  # stopped -- an operator Terminate
                if self._writer.alive():
                    self._stop_writer(graceful=True)
            # The uploader (if cloud is on) runs the whole session, regardless of
            # desired, so it keeps mirroring after a Terminate's final flush.
            if self._uploader is not None and self._uploader.due_for_respawn(
                RESPAWN_BACKOFF_S
            ):
                self._uploader.spawn(self._cloud_env)
            time.sleep(0.5)

        # Going down ourselves (not an operator Terminate): drop the writer but
        # leave its dive open so the next run.sh resumes it. We must not orphan
        # it -- a second writer would collide on DuckDB's single-writer lock.
        self._stop_writer(graceful=False)
        self._stop_uploader()
        self._client.loop_stop()
        print("[supervisor] stopped", flush=True)

    def _stop(self, _signum=None, _frame=None) -> None:
        self._running = False


def _parse_args(argv):
    p = argparse.ArgumentParser(description="Simpyl Database supervisor")
    p.add_argument("--cloud", action="store_true",
                   help="mirror the rolling parquet to Google Drive (opt-in)")
    p.add_argument("--cloud-login", action="store_true",
                   help="one-time: mint the Drive OAuth user token, then exit")
    p.add_argument("--gdrive-token", default=str(config.GDRIVE_TOKEN_PATH),
                   help="path to the OAuth user token json")
    p.add_argument("--gdrive-folder", default="",
                   help="destination Drive folder id (required with --cloud)")
    p.add_argument("--gdrive-client-secret", default="",
                   help="OAuth client secret json (required with --cloud-login)")
    return p.parse_args(argv)


if __name__ == "__main__":
    args = _parse_args(sys.argv[1:])

    if args.cloud_login:
        # One-shot interactive consent: never enters the reconcile loop.
        if not args.gdrive_client_secret:
            sys.exit("[supervisor] --cloud-login needs --gdrive-client-secret "
                     "<client_secret.json>")
        import cloud_auth  # lazy: only the cloud paths need google's libs
        config.ensure_dirs()
        token = cloud_auth.login(
            args.gdrive_client_secret, args.gdrive_token, config.GDRIVE_SCOPES
        )
        print(f"[supervisor] Drive token written to {token}", flush=True)
        sys.exit(0)

    cloud_env = None
    if args.cloud:
        if not args.gdrive_folder:
            sys.exit("[supervisor] --cloud needs --gdrive-folder <id>")
        cloud_env = {
            config.CLOUD_TOKEN_ENV: args.gdrive_token,
            config.CLOUD_FOLDER_ENV: args.gdrive_folder,
        }
        print("[supervisor] cloud mirror ON -> drive folder "
              f"{args.gdrive_folder}", flush=True)

    Supervisor(cloud_env).run()
