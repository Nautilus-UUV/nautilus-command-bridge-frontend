"""The cloud-mirror process: watches data/parquet/ and copies it to Drive.

Spawned by the supervisor only when --cloud is on (see supervisor.py), and kept
alive the whole session so it mirrors during the dive *and* catches the writer's
final-minute files after Terminate. Fully decoupled from the writer: it owns no
DB connection, just rescans the parquet dir every few seconds and uploads
whatever is new or changed. Its record of what's already on Drive lives on disk
(.upload_state.json), so a crash- or network-interrupted run just catches up on
the next scan -- nothing is uploaded twice, nothing is lost.

  * write-once minute files (sensor_*, commands_*) upload exactly once.
  * dives.parquet is rewritten in place each minute, so it re-uploads (updating
    the same Drive file) whenever its size/mtime changes.
"""

from __future__ import annotations

import json
import os
import signal
import time

import cloud_auth
import config


class Uploader:
    def __init__(self) -> None:
        config.ensure_dirs()
        token = os.environ.get(config.CLOUD_TOKEN_ENV) or str(config.GDRIVE_TOKEN_PATH)
        self._folder = os.environ.get(config.CLOUD_FOLDER_ENV) or ""
        if not self._folder:
            raise RuntimeError(
                "no Drive folder id -- pass --gdrive-folder to run.sh"
            )
        # Fail-fast on bad creds: the exception exits the process nonzero, the
        # supervisor backoff-respawns, and the repeated log surfaces the problem.
        self._service = cloud_auth.drive_service(token, config.GDRIVE_SCOPES)
        self._state: dict = self._load_state()
        self._running = True

    # --- upload-state record ------------------------------------------------

    def _load_state(self) -> dict:
        try:
            return json.loads(config.UPLOAD_STATE_PATH.read_text())
        except (FileNotFoundError, ValueError):
            return {}

    def _save_state(self) -> None:
        config.UPLOAD_STATE_PATH.write_text(json.dumps(self._state))

    # --- scan + upload ------------------------------------------------------

    def _scan(self) -> list[tuple[str, int, float]]:
        files = []
        for p in config.PARQUET_DIR.glob("*.parquet"):
            try:
                st = p.stat()
            except FileNotFoundError:
                continue  # rotated/removed between glob and stat
            files.append((p.name, st.st_size, st.st_mtime))
        return files

    def _upload_one(self, name: str, size: int, mtime: float) -> None:
        path = config.PARQUET_DIR / name
        prev = self._state.get(name)
        drive_id = prev.get("drive_id") if prev else None
        if drive_id:
            cloud_auth.update_file(self._service, path, drive_id)
        else:
            drive_id = cloud_auth.create_file(self._service, path, name, self._folder)
        self._state[name] = {"size": size, "mtime": mtime, "drive_id": drive_id}
        self._save_state()
        print(f"[uploader] mirrored {name} -> drive:{drive_id}", flush=True)

    def _tick(self) -> None:
        files = self._scan()
        planned = set(config.plan_uploads(files, self._state, time.time()))
        for name, size, mtime in files:
            if name not in planned:
                continue
            try:
                self._upload_one(name, size, mtime)
            except Exception as e:
                # Transient (network/Drive) error: leave the file unmarked and
                # retry next scan. A flaky tether must not kill the loop.
                print(f"[uploader] upload of {name} failed, will retry: {e}",
                      flush=True)

    # --- run loop -----------------------------------------------------------

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self._stop)
        signal.signal(signal.SIGINT, self._stop)
        print(f"[uploader] mirroring {config.PARQUET_DIR} -> drive folder "
              f"{self._folder}", flush=True)
        last = 0.0
        while self._running:
            now = time.monotonic()
            if now - last >= config.UPLOAD_SCAN_PERIOD_S:
                self._tick()
                last = now
            time.sleep(0.2)
        print("[uploader] stopped", flush=True)

    def _stop(self, _signum=None, _frame=None) -> None:
        self._running = False


if __name__ == "__main__":
    Uploader().run()
