# Database

Decoupled DuckDB logger that taps the mission-laptop MQTT broker and records all
glider traffic as time-series. Run every command below from this `db/` folder.
Architecture and schema: see [Design](#design) below.

## Startup

Dependencies:
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

Start the broker the logger taps, if it isn't already running:
```
mosquitto -c ../mosquitto/mosquitto.conf -v
```

Launch the supervisor for this session, it stays idle until a dive starts:
```
./run.sh
```

**From the frontend, name the dive in the box and press Start DB / Terminate DB in the init bar (the supervisor above must be running).**


Drop a labelled marker manually:
```
mosquitto_pub -t nautilus/db/cmd/marker -m '{"label":"valve stuck"}'
```

Terminate the dive manually:
```
mosquitto_pub -t nautilus/db/cmd/control -r -m '{"action":"terminate"}'
```

## Cloud mirror (optional)


One-time, mint an OAuth user token from your Google Cloud OAuth client (a Desktop app `client_secret.json`):
```
./run.sh --cloud-login --gdrive-client-secret <YOUR_SECRET>.json
```

Then launch the session with the mirror on, pointing at the destination Drive
folder id (the token defaults to `data/gdrive_token.json`):
```
./run.sh --cloud --gdrive-folder <DRIVE_FOLDER_ID>
```

## Verification

The writer reports itself online with the open dive id:
```
mosquitto_sub -t nautilus/db/status -C 1
```

Dives are searchable by name without stopping the logger (lock-free parquet snapshot):
```
.venv/bin/python -c "import duckdb; print(duckdb.sql(\"SELECT id,name,started_at,ended_at FROM 'data/parquet/dives.parquet'\"))"
```

After a minute, the current dive's sensor rows have rolled into parquet and are readable while recording continues:
```
.venv/bin/python -c "import duckdb; print(duckdb.sql(\"SELECT count(*), max(ts) FROM 'data/parquet/sensor_*.parquet' WHERE dive_id = (SELECT max(id) FROM 'data/parquet/dives.parquet')\"))"
```


Every command the laptop sent this dive is replayable in order:
```
.venv/bin/python -c "import duckdb; print(duckdb.sql(\"SELECT ts,type,source,params FROM 'data/parquet/commands_*.parquet' WHERE dive_id = (SELECT max(id) FROM 'data/parquet/dives.parquet') ORDER BY ts\"))"
```

Your marker landed on the current dive:
```
.venv/bin/python -c "import duckdb; print(duckdb.sql(\"SELECT ts,params FROM 'data/parquet/commands_*.parquet' WHERE type='marker' AND dive_id = (SELECT max(id) FROM 'data/parquet/dives.parquet')\"))"
```

The supervisor revives a killed writer and continues the same dive (same dive id after):
```
pkill -9 -f writer.py; sleep 2; mosquitto_sub -t nautilus/db/status -C 1
```

Inspect the full DuckDB store (terminate first):
```
mosquitto_pub -t nautilus/db/cmd/control -r -m '{"action":"terminate"}'; sleep 1; .venv/bin/python -c "import duckdb; print(duckdb.connect('data/nautilus.duckdb', read_only=True).sql('SELECT * FROM dives'))"
```

## Export

Export happens after the dive is terminated. Double check is termianted:
```bash
mosquitto_pub -t nautilus/db/cmd/control -r -m '{"action":"terminate"}'; sleep 2
```

Pack the store and the parquet into one gzip tarball, then checksum it so the
recipient can confirm it arrived intact:

```bash
tar -czf nautilus_export.tar.gz -C data nautilus.duckdb parquet
sha256sum nautilus_export.tar.gz | tee nautilus_export.tar.gz.sha256
```
The archive holds `nautilus.duckdb` and `parquet/` at its root. Send it (and the
`.sha256`) by whatever means -- attachment, file share, USB.

On the far side, verify the transfer, unpack, and check the store is coherent in
one shot -- `still_open` and both `orphan_*` should be `0` (every dive closed, no
row points at a missing dive), and `duckdb_rows` should equal `parquet_rows`:
```bash
sha256sum -c nautilus_export.tar.gz.sha256
tar -xzf nautilus_export.tar.gz
python -c "import duckdb; print(duckdb.connect(':memory:').execute(\"ATTACH 'nautilus.duckdb' AS db (READ_ONLY)\").sql(\"SELECT (SELECT count(*) FROM db.dives) dives, (SELECT count(*) FROM db.dives WHERE ended_at IS NULL) still_open, (SELECT count(*) FROM db.commands WHERE dive_id NOT IN (SELECT id FROM db.dives)) orphan_cmd, (SELECT count(*) FROM db.sensor WHERE dive_id NOT IN (SELECT id FROM db.dives)) orphan_sensor, (SELECT count(*) FROM db.sensor) duckdb_rows, (SELECT count(*) FROM 'parquet/sensor_*.parquet') parquet_rows, (SELECT max(ts) FROM db.sensor) last_sample\"))"
```

## Design


### Processes


- **supervisor.py** -- DuckDB-free, always idle. Subscribes the retained control
  topic and keeps `writer.py` in the desired state. Launched manually via
  `run.sh` once per operating session;
- **writer.py** -- the *sole* owner of the DuckDB connection. The paho network
  thread only appends parsed rows to in-memory buffers under a lock; the main
  thread drains them, so DuckDB's single-writer rule is trivially held.

### Resilience

- Writer crash while a dive is open -- supervisor respawns it; it **resumes the
  same dive** (resolves the open `ended_at IS NULL` row from the DB).
- Tether loss -- only the inbound glider data stops; the local writer/supervisor
  stay up, the dive stays open, sensor rows resume when traffic returns.
- Broker flap -- paho reconnects (exponential backoff) and resubscribes.
- Supervisor crash / laptop reboot -- operator re-runs `run.sh`; the retained
  control state + the open dive together restore where it left off.
- An open dive whose newest row is older than `STALE_DIVE_S` (10 min) is treated
  as abandoned: closed, and a fresh dive opened instead of resumed.

### MQTT

Tapped (everything, one wildcard): `nautilus/#`. Routed by prefix:

| prefix | table | notes |
|---|---|---|
| `nautilus/telemetry/*` | SENSOR | every numeric leaf -- one (channel, value) row |
| `nautilus/cmd/*` | COMMANDS | classified to (type, source); `cmd/heartbeat` dropped |
| `nautilus/status/*`, `nautilus/db/*` | -- | ignored (except the two db topics below) |

Owned `nautilus/db/*` subtree:

| topic | dir | payload | retain |
|---|---|---|---|
| `nautilus/db/cmd/control` | U --sup | `{"action":"start","name":"…"}` / `{"action":"terminate"}` | yes |
| `nautilus/db/cmd/marker` | U --writer | `{"label":"…","ts":"…"}` | no |
| `nautilus/db/status` | write --UI | `{"state":"online\|offline","dive_id":N,"buffered":k,"last_write":"…"}` | yes + LWT |

`source` mapping (topic-derived, in `config.classify_command`): dive-profile /
mission (`cmd/path`, `cmd/command`) -- `automatic`; `cmd/debug/*` -- `debug`;
init panel (`cmd/init`, `cmd/lifeguard`) -- `initialize`; the UI marker -- `manual`.

### Schema (DuckDB)

```
dives    (id, name, started_at, ended_at)            -- one row per Star --Terminate
commands (id, ts, dive_id, type, source, params)     -- lapto --glider + markers
sensor   (id, ts, dive_id, channel, value)           -- numeric telemetry leaves
```

`ts`/`started_at`/`ended_at` are the laptop wall clock. `name` is the operator's searchable dive label from the UI.
Non-numeric telemetry leaves (a mission `state`, a `frame_id`) are dropped from
`sensor` (value is DOUBLE); add a `text_value` column if they're ever needed.

### Storage / lock-free reads

- `data/nautilus.duckdb` -- the OLAP store, written in one transaction every
  `FLUSH_PERIOD_S` (2 s). Held read-write by the writer, so other processes
  cannot open it while recording.
- `data/parquet/{sensor,commands}_<YYYYmmddTHHMM>.parquet` -- one zstd file per
  closed wall-minute, written by DuckDB `COPY`. Plain files; any process reads
  them without the DB lock. This is the "investigate while it runs" path.
- `data/parquet/dives.parquet` -- small snapshot of the dives table, refreshed
  each rotation, so dives are searchable by name without stopping the writer.

### Cloud First Time (optional)

1. Create a project on https://console.cloud.google.com
2. **Enable the Google Drive API for that project** (APIs & Services -> Library -> "Google Drive API" -> Enable)
3. **OAuth consent screen** -> User type External -> add your own Google account as a Test user
4. **Credentials** -> Create credentials -> OAuth client ID -> Application type: Desktop app -> download the JSON -> save it as db/client_secret.json 
5. **Google Drive**, pick the destination folder and copy its id from the URL: drive.google.com/drive/folders/<THIS_PART>.

