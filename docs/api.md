# NAUTILUS Command Bridge — Backend API Reference

The frontend communicates with a **FastAPI** backend over HTTP. All requests are issued from `src/assets/api_requests.ts` via the `jsonRequest` helper.

## Base URL

```
http://localhost:8000/api
```

Defined as a constant in `src/assets/api_requests.ts`. To point at a different host, change `API_URL` there.

## Request conventions

| Property | Value |
|---|---|
| Content-Type | `application/json` |
| Credentials | `include` (cookies forwarded) |
| Body encoding | JSON — the `jsonRequest` wrapper serialises objects automatically |
| Query params | Appended as a `URLSearchParams` string when `params` is provided |

All endpoints below use **POST**. The body is always JSON unless marked as _no body_.

---

## Telemetry endpoints

The frontend polls these every **5 seconds** from `useDataLogStore`. Each sensor has two endpoints: a full load (used on first load or when the store is empty) and an incremental load-new (used on every subsequent poll, passing the timestamp of the most recent record already held).

### Depth

#### `POST /depth/load`
Returns the most recent depth readings.

**No body.**

**Response** — array of `DepthLog`:
```json
[
  {
    "log_id": "64a1f...",
    "record_datetime": "2024-06-01T12:00:00.000Z",
    "depth": 12.5
  }
]
```

#### `POST /depth/load-new`
Returns only records newer than the given timestamp.

**Body:**
```json
{ "record_datetime": "2024-06-01T12:00:00.000Z" }
```

**Response** — same shape as `/depth/load`, or empty array if nothing new.

---

### Target Depth

#### `POST /target_depth/load`
**No body.** Returns `DepthLog[]` (same shape as depth).

#### `POST /target_depth/load-new`
**Body:** `{ "record_datetime": "…" }` — returns `DepthLog[]`.

---

### Pose

#### `POST /pose/load`
**No body.**

**Response** — array of `PoseLog`:
```json
[
  {
    "log_id": "…",
    "record_datetime": "…",
    "x": 1.2,
    "y": 0.5,
    "z": -3.1,
    "qw": 0.998,
    "qx": 0.01,
    "qy": 0.04,
    "qz": 0.02
  }
]
```

#### `POST /pose/load-new`
**Body:** `{ "record_datetime": "…" }` — returns `PoseLog[]`.

---

### Pressure

#### `POST /pressure/load`
**No body.**

**Response** — array of `PressureLog`. The `location` field identifies the sensor:

| Value | Sensor |
|---|---|
| `hull` | Inside the vehicle hull |
| `tank` | Buoyancy tank |
| `ext` | External ambient water pressure |

```json
[
  {
    "log_id": "…",
    "record_datetime": "…",
    "pressure": 1.013,
    "location": "hull"
  }
]
```

#### `POST /pressure/load-new`
**Body:** `{ "record_datetime": "…" }` — returns `PressureLog[]`.

---

### Leakage

#### `POST /leakage/load`
**No body.**

**Response** — array of `LeakageLog`:

```json
[
  {
    "log_id": "…",
    "record_datetime": "…",
    "has_leak": false,
    "location": "front"
  }
]
```

`location` is either `"front"` or `"back"`.

#### `POST /leakage/load-new`
**Body:** `{ "record_datetime": "…" }` — returns `LeakageLog[]`.

---

### System Alive

#### `POST /alive/load`
**No body.**

**Response** — array of `AliveLog`:
```json
[
  {
    "log_id": "…",
    "record_datetime": "…",
    "is_alive": true
  }
]
```

#### `POST /alive/load-new`
**Body:** `{ "record_datetime": "…" }` — returns `AliveLog[]`.

---

## Command endpoints

Managed by `useCommandStore`. The history panel polls `/commands/load-new` every 5 seconds for status updates on existing commands.

### `POST /commands/load`
Returns the command history, newest first.

**No body.** Supports optional pagination via query param:

| Param | Type | Description |
|---|---|---|
| `skip` | string (integer) | Number of records to skip — used for infinite scroll |

**Response** — array of `Command`:
```json
[
  {
    "command_id": "c3d2a1…",
    "command": "Start",
    "status": "acknowledged",
    "send_retries": 0,
    "last_update_datetime": "2024-06-01T12:01:00.000Z"
  }
]
```

`status` values: `queued` | `acknowledged` | `failed`

`command` values: `Start` | `Stop` | `Pause` | `Abort` | `Mission_Profile`

---

### `POST /commands/load-new`
Returns only commands updated after the given timestamp (used for polling).

**Body:**
```json
{ "last_update_datetime": "2024-06-01T12:01:00.000Z" }
```

**Response** — `Command[]`, or empty array.

---

### `POST /commands/create`
Dispatches a new command to the vehicle.

**Body:**
```json
{
  "command": "Start"
}
```

For `Mission_Profile`, include a `data` field:
```json
{
  "command": "Mission_Profile",
  "data": {
    "name": "Dive 1",
    "waypoints": [
      { "x": 0.0, "y": 0.0, "z": 5.0 },
      { "x": 10.0, "y": 0.0, "z": 10.0 }
    ]
  }
}
```

> **Note:** Server-loaded mission profiles (from `/mission-profiles/load`) use the legacy `Waypoint` shape `{ depth, pause_duration }`. Locally authored Naive path segments use `{ x, y, z }`. The backend must accept both shapes under `data`.

**Response** — the created `Command` object with its assigned `command_id` and initial `status: "queued"`.

---

## Mission profile endpoints

Managed by `useMissionStore`. Profiles are loaded once on store initialisation.

### `POST /mission-profiles/load`
Returns all saved mission profiles.

**No body.**

**Response:**
```json
{
  "mission_profiles": [
    {
      "mission_id": "m1a2b…",
      "name": "Test Dive",
      "waypoints": [
        { "depth": 10.0, "pause_duration": 5 },
        { "depth": 25.0, "pause_duration": 0 }
      ]
    }
  ]
}
```

---

### `POST /mission-profiles/create`
Creates a new mission profile.

**Body:**
```json
{
  "name": "New Mission",
  "waypoints": []
}
```

**Response:**
```json
{ "mission_id": "m1a2b…" }
```

---

### `POST /mission-profiles/update`
Overwrites an existing mission profile.

**Body** — full `Mission` object:
```json
{
  "mission_id": "m1a2b…",
  "name": "Updated Dive",
  "waypoints": [
    { "depth": 15.0, "pause_duration": 10 }
  ]
}
```

**Response** — success indicator (exact shape backend-defined).

---

### `POST /mission-profiles/delete`
Deletes a mission profile. Deletion is blocked client-side if only one profile remains.

**Body:**
```json
{ "mission_id": "m1a2b…" }
```

**Response** — success indicator.

---

## Simulation endpoints (planned)

The simulation store (`useSimulationStore`) contains stubs for these endpoints. They are not yet implemented in either the frontend or backend.

| Endpoint | Purpose |
|---|---|
| `POST /simulation/start` | Send `SimulationConfig` and begin simulation run |
| `POST /simulation/stop` | Halt the running simulation |
| `POST /simulation/depth/load-new` | Poll for new simulated depth records during a run |

Expected body for `/simulation/start`:
```json
{
  "model": "constant_velocity",
  "speed": 0.5,
  "max_depth": 50,
  "update_rate": 1,
  "notes": ""
}
```

---

## FastAPI implementation notes

- All endpoints use `POST` rather than the conventional REST verbs. This is a deliberate project convention — it simplifies CORS preflight handling and avoids GET caching issues with telemetry data.
- The frontend sends `credentials: 'include'`, so the FastAPI app must set `allow_credentials=True` in its `CORSMiddleware` configuration and specify explicit origins (wildcards are rejected by browsers when credentials are included).
- IDs (`log_id`, `mission_id`, `command_id`) are MongoDB ObjectIds serialised as hex strings.
- All datetimes are ISO 8601 strings in UTC.

### Minimal CORS setup

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)
```
