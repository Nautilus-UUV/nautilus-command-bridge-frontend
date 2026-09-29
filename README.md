# Nautilus Command Bridge

Operator UI for Nautilus's autonomous glider (UG), running on the mission laptop, plus a DuckDB dive logger (`db/`).

## Setup

Part of the `~/nautilus_ws` workspace described in the [Control Stack](https://github.com/Nautilus-UUV/nautilus-ros) README. Cloned at the workspace root, not under `src/`.

### Steps

1. Install [Node.js](https://nodejs.org/en/download) (v20 or newer) and [Mosquitto](https://mosquitto.org/download/):
```bash
sudo apt install mosquitto mosquitto-clients python3-venv
```
2. Clone repository:
```bash
cd ~/nautilus_ws
git clone git@github.com:Nautilus-UUV/nautilus-command-bridge-frontend.git
```
3. Install dependencies:
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend
npm install
```
4. Install the dive logger:
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend/db
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## Usage

### Mission Laptop

Start the MQTT broker:
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend
mosquitto -c ./mosquitto/mosquitto.conf -v
```

Start the UI (http://localhost:3000):
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend
npm run dev
```

### Dive Logger

Start the logger (idle until a dive starts):
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend/db
./run.sh
```

**In the UI, name the dive and press Start DB / Terminate DB in the init bar.**


Export after the dive is terminated:
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend/db
tar -czf nautilus_export.tar.gz -C data nautilus.duckdb parquet
sha256sum nautilus_export.tar.gz | tee nautilus_export.tar.gz.sha256
```

Investigate the data (works while recording):
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend/db
.venv/bin/python
```
```python
import duckdb

# List all dives
duckdb.sql("""
    SELECT *
    FROM 'data/parquet/dives.parquet'
""").show()

# Sensor data of one dive
duckdb.sql("""
    SELECT ts, channel, value
    FROM 'data/parquet/sensor_*.parquet'
    WHERE dive_id = <DIVE_ID>
    ORDER BY ts
""").show()
```

### Google Drive Mirror (optional)

One-time Google Cloud setup:
1. Create a project on https://console.cloud.google.com and enable the **Google Drive API**.
2. **OAuth consent screen**: user type External, add your Google account as a test user.
3. **Credentials**: create an OAuth client ID of type Desktop app, download the JSON into `db/`.
4. Copy the destination folder id from its URL: `drive.google.com/drive/folders/<FOLDER_ID>`.

One-time login:
```bash
cd ~/nautilus_ws/nautilus-command-bridge-frontend/db
./run.sh --cloud-login --gdrive-client-secret <CLIENT_SECRET>.json
```

Start the logger with the mirror on:
```bash
./run.sh --cloud --gdrive-folder <FOLDER_ID>
```
