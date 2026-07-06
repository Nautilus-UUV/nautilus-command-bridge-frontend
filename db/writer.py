"""The single DuckDB writer: taps the broker, batches to DuckDB, rolls Parquet.

Lifecycle (the supervisor owns it, see supervisor.py):
  - On start it resolves the dive to write into -- resume the open dive if one
    exists and is recent (a crash-respawn continues the same dive), otherwise
    open a fresh one. An open-but-stale dive (an unclean past session) is closed
    and replaced.
  - The paho network thread only ever appends parsed rows to in-memory buffers
    under a lock; this main thread is the owner of the DuckDB connection.
    That keeps DuckDB's single-writer rule trivially satisfied.
  - Every 2 s it drains the buffers into one transaction (the OLAP batch). At
    each wall-minute boundary it COPYs the just-closed minute out to a zstd
    Parquet file -- a plain file any other process can read without touching the
    locked .duckdb.
  - It heartbeats nautilus/db/status (retained) ~1 Hz; an unclean death trips the
    last-will to "offline", a clean SIGTERM closes the dive and goes offline
    explicitly. Either way the UI's Simpyl Database marker reflects it.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

import config
import mqtt_source
import schema
from flatten import flatten

_OFFLINE = json.dumps({"state": "offline"})


class Writer:
    def __init__(self) -> None:
        config.ensure_dirs()
        self._con = schema.connect(str(config.DUCKDB_PATH))
        # Name for a freshly opened dive (handed down by the supervisor). A
        # resume keeps the existing row's name, so this is only used on create.
        self._dive_name = os.environ.get(config.DIVE_NAME_ENV) or None
        self._dive_id = self._resolve_dive()

        # Buffers filled by the paho thread, drained by the main thread.
        self._lock = threading.Lock()
        self._sensor_buf: list[tuple] = []
        self._cmd_buf: list[tuple] = []

        self._current_minute: datetime | None = None
        self._last_write: datetime | None = None
        self._running = True

        client_id = f"nautilus-db-writer-{int(time.time())}"
        self._client = mqtt_source.make_client(
            client_id,
            on_connect=self._on_connect,
            on_message=self._on_message,
            will=(config.DB_STATUS_TOPIC, _OFFLINE, 1, True),
        )

    # --- dive resolution ----------------------------------------------------

    def _resolve_dive(self) -> int:
        """Resume a recent open dive, else open a fresh one (closing a stale one)."""
        now = datetime.now()
        row = self._con.execute(
            "SELECT id, started_at FROM dives WHERE ended_at IS NULL "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if row is not None:
            dive_id, started_at = row
            last = self._con.execute(
                "SELECT max(ts) FROM sensor WHERE dive_id = ?", [dive_id]
            ).fetchone()[0]
            ref = last or started_at
            if ref is None or (now - ref).total_seconds() <= config.STALE_DIVE_S:
                print(f"[writer] resuming open dive {dive_id}", flush=True)
                return dive_id
            # Stale: an abandoned dive from an unclean past session. Close it.
            self._con.execute(
                "UPDATE dives SET ended_at = ? WHERE id = ?", [ref, dive_id]
            )
            print(f"[writer] closed stale dive {dive_id}, opening a new one", flush=True)

        new_id = self._con.execute(
            "INSERT INTO dives (name, started_at) VALUES (?, ?) RETURNING id",
            [self._dive_name, now],
        ).fetchone()[0]
        print(f"[writer] opened dive {new_id} (name={self._dive_name!r})", flush=True)
        return new_id

    def _close_dive(self) -> None:
        self._con.execute(
            "UPDATE dives SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
            [datetime.now(), self._dive_id],
        )

    # --- MQTT ---------------------------------------------------------------

    def _on_connect(self, client, _userdata, _flags, _reason, _props=None) -> None:
        # One wildcard catches all glider traffic AND our own db/* subtree;
        # routing in _on_message sorts it out. Replays on every reconnect.
        client.subscribe(config.WILDCARD, qos=0)
        print("[writer] connected, subscribed", config.WILDCARD, flush=True)

    def _on_message(self, _client, _userdata, msg) -> None:
        ts = datetime.now()
        topic = msg.topic
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            payload = None  # bare-string status etc. -- not for us

        # Our own db/* subtree: only the marker is recorded; status/control skip.
        if topic == config.DB_MARKER_TOPIC:
            row = (ts, self._dive_id, "marker", config.SOURCE_MANUAL,
                   json.dumps(payload))
            with self._lock:
                self._cmd_buf.append(row)
            return
        if topic.startswith(config.DB_PREFIX) or topic.startswith("nautilus/status/"):
            return

        if topic.startswith(config.TELEMETRY_PREFIX):
            if not isinstance(payload, dict):
                return
            rows = flatten(config.channel_of(topic), payload)
            if rows:
                with self._lock:
                    self._sensor_buf.extend(
                        (ts, self._dive_id, ch, val) for ch, val in rows
                    )
            return

        if topic.startswith(config.CMD_PREFIX):
            cls = config.classify_command(
                topic, payload if isinstance(payload, dict) else {}
            )
            if cls is None:
                return
            ctype, source = cls
            row = (ts, self._dive_id, ctype, source, json.dumps(payload))
            with self._lock:
                self._cmd_buf.append(row)

    def _publish_status(self, state: str) -> None:
        with self._lock:
            buffered = len(self._sensor_buf) + len(self._cmd_buf)
        body = json.dumps({
            "state": state,
            "dive_id": self._dive_id,
            "buffered": buffered,
            "last_write": self._last_write.isoformat() if self._last_write else None,
        })
        self._client.publish(config.DB_STATUS_TOPIC, body, qos=1, retain=True)

    # --- batch write + parquet rotation -------------------------------------

    def _flush(self) -> None:
        with self._lock:
            sensors, self._sensor_buf = self._sensor_buf, []
            cmds, self._cmd_buf = self._cmd_buf, []
        if not sensors and not cmds:
            return
        self._con.execute("BEGIN TRANSACTION")
        try:
            if sensors:
                self._con.executemany(
                    "INSERT INTO sensor (ts, dive_id, channel, value) "
                    "VALUES (?, ?, ?, ?)", sensors
                )
            if cmds:
                self._con.executemany(
                    "INSERT INTO commands (ts, dive_id, type, source, params) "
                    "VALUES (?, ?, ?, ?, ?)", cmds
                )
            self._con.execute("COMMIT")
        except Exception:
            self._con.execute("ROLLBACK")
            raise
        self._last_write = datetime.now()

    def _rotate_parquet(self, final: bool = False) -> None:
        """Export each wall-minute that has closed since the last rotation.

        On shutdown (`final`) also export the current, still-open minute so the
        tail isn't lost.
        """
        this_minute = datetime.now().replace(second=0, microsecond=0)
        if self._current_minute is None:
            self._current_minute = this_minute
            self._export_dives()  # initial snapshot so the name is searchable early
            return
        if this_minute > self._current_minute:
            m = self._current_minute
            while m < this_minute:
                self._export_minute(m)
                m += timedelta(minutes=1)
            self._current_minute = this_minute
            self._export_dives()
        if final:
            self._export_minute(this_minute)
            self._export_dives()

    def _copy_parquet(self, select_sql: str, path: Path) -> None:
        """COPY a SELECT out to a zstd Parquet file -- the one place that format lives."""
        self._con.execute(
            f"COPY ({select_sql}) TO '{path}' (FORMAT PARQUET, COMPRESSION 'zstd')"
        )

    def _export_dives(self) -> None:
        """Refresh a lock-free snapshot of the (small) dives table.

        The live .duckdb is held by this writer, so other processes can't open
        it; this snapshot lets analysis search dives by name without stopping the
        logger. Overwritten in place each rotation.
        """
        self._copy_parquet("SELECT * FROM dives", config.PARQUET_DIR / "dives.parquet")

    def _export_minute(self, minute: datetime) -> None:
        lo = minute.strftime("%Y-%m-%d %H:%M:%S")
        hi = (minute + timedelta(minutes=1)).strftime("%Y-%m-%d %H:%M:%S")
        stamp = minute.strftime("%Y%m%dT%H%M")
        window = f"WHERE ts >= TIMESTAMP '{lo}' AND ts < TIMESTAMP '{hi}'"
        for table in ("sensor", "commands"):
            n = self._con.execute(
                f"SELECT count(*) FROM {table} {window}"
            ).fetchone()[0]
            if not n:
                continue
            path = config.PARQUET_DIR / f"{table}_{stamp}.parquet"
            self._copy_parquet(f"SELECT * FROM {table} {window}", path)
            print(f"[writer] exported {n} {table} rows -> {path.name}", flush=True)

    # --- run loop -----------------------------------------------------------

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self._stop)
        signal.signal(signal.SIGINT, self._stop)
        mqtt_source.start(self._client)

        last_flush = last_status = time.monotonic()
        while self._running:
            now = time.monotonic()
            if now - last_flush >= config.FLUSH_PERIOD_S:
                self._flush()
                self._rotate_parquet()
                last_flush = now
            if now - last_status >= config.STATUS_PERIOD_S:
                self._publish_status("online")
                last_status = now
            time.sleep(0.1)

        self._shutdown()

    def _stop(self, _signum=None, _frame=None) -> None:
        self._running = False

    def _shutdown(self) -> None:
        print("[writer] shutting down: final flush + closing dive", flush=True)
        self._flush()
        # Close the dive BEFORE the final export so dives.parquet reflects
        # ended_at (a crash skips _shutdown entirely, correctly leaving it open).
        self._close_dive()
        self._rotate_parquet(final=True)
        self._publish_status("offline")
        time.sleep(0.2)  # give the retained offline a moment to leave
        self._client.disconnect()  # clean -> suppresses the last-will
        self._client.loop_stop()
        self._con.close()


if __name__ == "__main__":
    Writer().run()
