# NAUTILUS Command Bridge — System Overview

## 1. Technology Stack

| Layer | Technology |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) |
| Language | TypeScript |
| Build Tool | Vite 5 |
| State Management | Pinia |
| UI Component Library | Vuetify 3 (Material Design) |
| Charting | Chart.js 3 + vue-chart-3 |
| Drag-and-Drop | vuedraggable 4 |
| Date/Time | Luxon |
| Icons | Material Design Icons (@mdi/font) |
| Backend Communication | REST API polling (no WebSocket) |

---

## 2. Project Structure

```
src/
├── App.vue                          # Root component (router-view only)
├── main.ts                          # Entry point
├── assets/
│   ├── api_requests.ts              # Generic fetch wrapper (apiRequest / jsonRequest)
│   └── logo.png
├── components/
│   ├── SimpleCardWrapper.vue        # Reusable v-card container with optional title
│   └── CommandPanels/
│       ├── CommandBtnPanel.vue      # Quick action controls (Start/Stop/Abort + profile loader)
│       ├── CommandHistoryPanel.vue  # Infinite-scroll command history list
│       └── CommandProfilePanel.vue # Drag-and-drop waypoint/mission editor
├── layouts/default/
│   ├── Default.vue                  # Top-level layout (AppBar + View)
│   ├── AppBar.vue                   # Navigation bar with logo and route links
│   └── View.vue                     # v-main wrapper for router-view
├── views/
│   ├── Charts.vue                   # Real-time sensor dashboard (route: /)
│   └── Commands.vue                 # Command control center (route: /commands)
├── router/index.ts                  # Route definitions
├── store/
│   ├── index.ts                     # Pinia instance creation
│   ├── commands.ts                  # Commands state + polling
│   ├── datalogs.ts                  # Sensor data state + polling
│   └── missions.ts                  # Mission/dive-profile state
├── types/
│   ├── CommandsTypes.ts             # Command, CommandTypes, CommandStatus
│   ├── DatabaseTypes.ts             # DepthLog, PoseLog, PressureLog, LeakageLog, AliveLog
│   └── MissionTypes.ts             # Mission, Waypoint
├── plugins/
│   ├── index.ts                     # Plugin registration
│   └── vuetify.ts                   # Vuetify theme (primary: indigo)
└── styles/settings.scss             # Global SCSS overrides (minimal)
```

---

## 3. Routing

| Path | Name | View | Description |
|---|---|---|---|
| `/` | Charts | Charts.vue | Real-time sensor data dashboard |
| `/commands` | Commands | Commands.vue | Mission and command control center |

---

## 4. Features

### 4.1 Real-Time Sensor Dashboard (`Charts.vue`)

Displays live data read from the Pinia data-log store. Updates every 5 seconds via polling.

**Sensor panels:**

| Panel | Data Source | Displayed Values |
|---|---|---|
| Timestamp | `depths[0].record_datetime` | Latest record time (ISO → HH:mm:ss.SSS) |
| Position | `poses[0]` | x, y, z coordinates |
| Orientation | `poses[0]` | Quaternion qw, qx, qy, qz |
| Depth | `depths[0].depth` | Current depth (m) |
| Target Depth | `targetDepths[0].depth` | Commanded depth (m) |
| Hull Pressure | `pressures[location='hull']` | Pressure reading |
| Tank Pressure | `pressures[location='tank']` | Pressure reading |
| Ext Pressure | `pressures[location='ext']` | External pressure reading |
| Leakage | `leakages[0]` | has_leak (Yes/No), last leak time, reset button |
| System Alive | `alives` | All sensors alive → true/false |

**Chart:**
- Line chart of the last 30 depth readings
- X-axis: time (HH:mm:ss.SSS)
- Y-axis: depth in meters (0 to −100 m)
- Rendered with Chart.js at 560×420 px

### 4.2 Command Control Center (`Commands.vue`)

Three panels arranged in a 2-column grid (stacks vertically below 960 px).

#### Quick Actions Panel (`CommandBtnPanel.vue`)
- **Dive Profile Selector**: `v-select` showing all saved missions by name; sets `selectedMissionId` in the missions store.
- **Load To UUV**: sends a `Mission_Profile` command with the selected mission.
- **Start**: sends a `Start` command.
- **Stop**: sends a `Stop` command.
- **ABORT**: sends an `Abort` command (large, red, `x-large` size).

#### Command History Panel (`CommandHistoryPanel.vue`)
- Infinite-scroll list of all commands, newest first.
- Each entry shows:
  - Status chip (amber = queued/sent, green = acknowledged, red = failed) with retry count icon.
  - Command type (e.g. `Mission_Profile`, `Start`).
  - Command ID (UUID).
  - Timestamp chip (HH:mm:ss).
- Loads older commands on scroll via `extendedLoad`.

#### Dive Profile Editor (`CommandProfilePanel.vue`)
- **Mission selector**: choose active mission from a `v-select`.
- **Create** (+ button): creates a new mission with a default name.
- **Name field**: editable text field for the mission name.
- **Waypoint table** (drag-and-drop via vuedraggable):
  - Column: Waypoint number + drag handle.
  - Column: Target depth (m), editable number field.
  - Column: Pause duration (s), editable number field.
  - Column: Delete waypoint button.
- **Add Waypoint** footer button: appends a new `{depth: 0, pause_duration: 0}` entry.
- **Save** (floppy disk icon): calls `updateMission()` to persist to backend.
- **Delete** (trash icon): deletes the current mission (disabled when only 1 mission exists).

### 4.3 Data Polling

All data is fetched via REST from `http://localhost:8000/api`. There is no WebSocket connection. Two polling loops run every **5 seconds**:

1. **Data logs loop** (`datalogs.ts → checkForNewData`): polls 6 endpoints for new sensor records since the last-seen timestamp.
2. **Commands loop** (`commands.ts → checkForNew`): polls for new commands since the last-seen timestamp.

Data limits: each sensor array is capped at **100 records** in memory.

---

## 5. State Management (Pinia)

### `commands.ts`

| State | Type | Description |
|---|---|---|
| `commands` | `Command[] \| null` | Ordered list of commands (null = not yet loaded) |
| `commandIdSet` | `Set<string>` | Fast-lookup set of already-seen IDs |

**Key actions:**
- `baseLoad()` — initial fetch of command history.
- `extendedLoad({ done })` — lazy-load older commands for infinite scroll.
- `insertCommands(newCommands)` — merge-insert preserving chronological sort.
- `checkForNew()` — polling tick; fetches commands newer than latest timestamp.
- `sendCommand(type, data?)` — creates a new command via POST.

### `datalogs.ts`

| State key | Type | Description |
|---|---|---|
| `depths` | `DepthLog[]` | Depth sensor readings |
| `targetDepths` | `DepthLog[]` | Target depth commands |
| `poses` | `PoseLog[]` | 6-DOF pose (x,y,z + quaternion) |
| `pressures` | `PressureLog[]` | Pressure readings (hull / tank / ext) |
| `leakages` | `LeakageLog[]` | Leak sensor readings (front / back) |
| `alives` | `AliveLog[]` | Heartbeat / alive status |

**Key actions:**
- `loadDataLogs()` — initial load of all 6 data types.
- `checkForNewData()` — polling tick across all 6 types.
- `resetLeak()` — temporary: manually clears latest leakage flag to false.

### `missions.ts`

| State | Type | Description |
|---|---|---|
| `missions` | `Mission[]` | All saved dive profiles |
| `selectedMissionId` | `string \| null` | Currently selected mission ID |

**Computed:**
- `currentMission` — the `Mission` object matching `selectedMissionId`.

**Key actions:**
- `loadMissions()` — initial load from `/mission-profiles/load`.
- `createMission()` — POST new mission, auto-selects it.
- `updateMission()` — POST updated waypoints/name.
- `deleteMission()` — POST delete (blocked if only 1 mission remains).
- `sendCurrentMission()` — sends `Mission_Profile` command with selected mission data.

---

## 6. API Endpoints

Base URL: `http://localhost:8000/api`

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/commands/load` | Fetch all commands (paginated) |
| GET | `/commands/load-new` | Fetch commands after a timestamp |
| POST | `/commands/create` | Create a new command |
| GET | `/depth/load` | Fetch depth logs |
| GET | `/depth/load-new` | Fetch depth logs after timestamp |
| GET | `/target_depth/load` | Fetch target-depth logs |
| GET | `/target_depth/load-new` | Fetch target-depth logs after timestamp |
| GET | `/pose/load` | Fetch pose logs |
| GET | `/pose/load-new` | Fetch pose logs after timestamp |
| GET | `/pressure/load` | Fetch pressure logs |
| GET | `/pressure/load-new` | Fetch pressure logs after timestamp |
| GET | `/leakage/load` | Fetch leakage logs |
| GET | `/leakage/load-new` | Fetch leakage logs after timestamp |
| GET | `/alive/load` | Fetch alive/heartbeat logs |
| GET | `/alive/load-new` | Fetch alive logs after timestamp |
| GET | `/mission-profiles/load` | Fetch all saved missions |
| POST | `/mission-profiles/create` | Create a new mission |
| POST | `/mission-profiles/update` | Update mission name/waypoints |
| POST | `/mission-profiles/delete` | Delete a mission |

---

## 7. Type Definitions

### Commands

```typescript
type CommandTypes = 'Mission_Profile' | 'Start' | 'Stop' | 'Pause' | 'Abort'
type CommandStatus = 'queued' | 'acknowledged' | 'failed'

interface Command {
  command_id: string
  command: CommandTypes
  status: CommandStatus
  send_retries: number
  last_update_datetime: string  // ISO 8601
}
```

### Sensor Logs

```typescript
interface DatabaseLog { record_datetime: string; log_id: string }

interface DepthLog extends DatabaseLog { depth: number }

interface PoseLog extends DatabaseLog {
  x: number; y: number; z: number
  qw: number; qx: number; qy: number; qz: number
}

type PressureSensorLocations = 'hull' | 'tank' | 'ext'
interface PressureLog extends DatabaseLog {
  pressure: number
  location: PressureSensorLocations
}

type LeakageSensorLocations = 'front' | 'back'
interface LeakageLog extends DatabaseLog {
  has_leak: boolean
  location: LeakageSensorLocations
}

interface AliveLog extends DatabaseLog { is_alive: boolean }
```

### Missions

```typescript
interface Waypoint { id?: number; depth: number; pause_duration: number }
interface Mission { mission_id: string; name: string; waypoints: Waypoint[] }
```

---

## 8. Notable Implementation Notes

- **Polling, not WebSocket**: The app polls every 5 s via `setInterval`. This keeps the backend simple but adds ~5 s latency for new data.
- **Data cap**: Each sensor log array is trimmed to the latest 100 records on every poll.
- **Command sort**: Commands are always displayed newest-first by `last_update_datetime`.
- **Waypoint IDs**: Waypoints use locally-generated incremental IDs to enable stable drag-and-drop reordering with vuedraggable.
- **Leakage reset**: `resetLeak()` is a temporary client-side workaround — it mutates the local state directly rather than posting to the backend.
- **Responsive layout**: Commands view uses CSS Grid (2×2) above 960 px and flexbox column below.
