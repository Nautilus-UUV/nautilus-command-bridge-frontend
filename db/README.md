# Dive Logger

Records all glider MQTT traffic on the mission laptop into DuckDB. Setup and usage: see the [main README](../README.md#dive-logger).

## Storage

| File | Content |
|---|---|
| `data/nautilus.duckdb` | Full store, written every 2 s. Locked while recording. |
| `data/parquet/{sensor,commands}_<YYYYmmddTHHMM>.parquet` | One file per minute. Readable while recording. |
| `data/parquet/dives.parquet` | Copy of the `dives` table, refreshed every minute. |

## Schema

Timestamps are the laptop clock.

### `dives`

One row per Start DB / Terminate DB.

| Column | Type | Description |
|---|---|---|
| `id` | BIGINT | Dive id |
| `name` | VARCHAR | Dive name typed in the UI |
| `started_at` | TIMESTAMP | Start DB pressed |
| `ended_at` | TIMESTAMP | Terminate DB pressed, empty while the dive is open |

### `commands`

One row per command sent from the laptop to the glider, plus markers.

| Column | Type | Description |
|---|---|---|
| `id` | BIGINT | Command id |
| `ts` | TIMESTAMP | Time received |
| `dive_id` | BIGINT | Dive it belongs to |
| `type` | VARCHAR | Command name, e.g. `sawtooth`, `bcu_rpm`, `lifeguard_arm`, `marker` |
| `source` | VARCHAR | `automatic`, `debug`, `initialize` or `manual` |
| `params` | VARCHAR | Original command as JSON |

### `sensor`

One row per numeric telemetry value. Non-numeric values are not stored.

| Column | Type | Description |
|---|---|---|
| `id` | BIGINT | Row id |
| `ts` | TIMESTAMP | Time received |
| `dive_id` | BIGINT | Dive it belongs to |
| `channel` | VARCHAR | Telemetry field, e.g. `telemetry/external/pressure/data` |
| `value` | DOUBLE | Value |

## MQTT

| Topic | Stored in |
|---|---|
| `nautilus/telemetry/#` | `sensor` |
| `nautilus/cmd/#` (except `cmd/heartbeat`) | `commands` |
| `nautilus/db/cmd/control` | Start / terminate a dive (retained) |
| `nautilus/db/cmd/marker` | `commands`, as a marker |
| `nautilus/db/status` | Logger state, read by the UI (retained) |

## Processes

- `run.sh` starts `supervisor.py`, which keeps `writer.py` running while a dive is open.
- `writer.py` is the only process that writes to DuckDB.

## Recovery

- Writer crash: restarted by the supervisor, continues the same dive.
- Tether loss: the dive stays open, recording resumes when data returns.
- Laptop reboot: re-run `run.sh`, the open dive continues.
- Dive with no data for 10 min: closed, the next start opens a new dive.
