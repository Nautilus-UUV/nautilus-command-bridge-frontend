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
"""

from __future__ import annotations

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


class Supervisor:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._desired = "stopped"        # set by control messages
        self._dive_name = ""             # operator-given name, rides the start cmd
        self._proc: subprocess.Popen | None = None
        self._last_spawn = 0.0
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

    # --- writer lifecycle ---------------------------------------------------

    def _alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def _spawn(self) -> None:
        self._last_spawn = time.monotonic()
        with self._lock:
            name = self._dive_name
        env = {**os.environ, config.DIVE_NAME_ENV: name}
        # Own session: terminal signals (Ctrl-C) hit only the supervisor.
        self._proc = subprocess.Popen(
            [sys.executable, str(config.WRITER_PATH)],
            cwd=str(config.HERE),
            start_new_session=True,
            env=env,
        )
        print(f"[supervisor] spawned writer pid={self._proc.pid}", flush=True)

    def _stop_writer(self, graceful: bool) -> None:
        """Stop the writer, with deliberately different effects on the dive.

        graceful (operator Terminate): SIGTERM so the writer sets ended_at and
        closes the dive; a stuck writer is escalated to SIGKILL after the grace.
        non-graceful (supervisor itself going down): SIGKILL straight away so the
        dive stays OPEN (ended_at NULL) for the next run to resume.
        """
        if not self._alive():
            self._proc = None
            return
        if graceful:
            print(f"[supervisor] terminating writer pid={self._proc.pid} (closing dive)",
                  flush=True)
            self._proc.terminate()  # SIGTERM -> writer sets ended_at, exits
        else:
            print(f"[supervisor] killing writer pid={self._proc.pid} (dive stays open)",
                  flush=True)
            self._proc.kill()
        try:
            self._proc.wait(timeout=TERMINATE_GRACE_S)
        except subprocess.TimeoutExpired:
            if graceful:  # escalate a stuck graceful stop to a hard kill
                print("[supervisor] writer didn't exit, killing", flush=True)
                self._proc.kill()
        self._proc = None

    # --- reconcile loop -----------------------------------------------------

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self._stop)
        signal.signal(signal.SIGINT, self._stop)
        mqtt_source.start(self._client)

        while self._running:
            with self._lock:
                desired = self._desired
            if desired == "running":
                if not self._alive() and (
                    time.monotonic() - self._last_spawn >= RESPAWN_BACKOFF_S
                ):
                    self._spawn()
            else:  # stopped -- an operator Terminate
                if self._alive():
                    self._stop_writer(graceful=True)
            time.sleep(0.5)

        # Going down ourselves (not an operator Terminate): drop the writer but
        # leave its dive open so the next run.sh resumes it. We must not orphan
        # it -- a second writer would collide on DuckDB's single-writer lock.
        self._stop_writer(graceful=False)
        self._client.loop_stop()
        print("[supervisor] stopped", flush=True)

    def _stop(self, _signum=None, _frame=None) -> None:
        self._running = False


if __name__ == "__main__":
    Supervisor().run()
