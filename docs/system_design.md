# NAUTILUS Command Bridge — System Design

## System Overview

NAUTILUS Command Bridge is a Vue 3 + TypeScript single-page application for monitoring and controlling an autonomous underwater vehicle (AUV/UUV). It runs on port 3000 and connects to a REST backend at `http://localhost:8000/api`. The frontend is responsible for all operator interaction: real-time telemetry visualization, command dispatch, dive profile authoring, and simulation configuration. The backend is treated as a dumb data store and command queue — the frontend drives all business logic visible to the operator.

There is no WebSocket connection. All live data is acquired via REST polling on 5-second intervals, which keeps backend requirements minimal and suits the expected ~5 s latency tolerance of UUV operations.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (port 3000)                      │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌─────────────────────────────┐ │
│  │ AppBar   │   │ View.vue │   │        Pinia Stores         │ │
│  │ (nav +   │   │ (router- │   │  ┌──────────┬────────────┐  │ │
│  │  theme)  │   │  view)   │   │  │ datalogs │  commands  │  │ │
│  └──────────┘   └────┬─────┘   │  ├──────────┼────────────┤  │ │
│                      │         │  │ missions │ simulations│  │ │
│         ┌────────────┼──────┐  │  ├──────────┼────────────┤  │ │
│         │            │      │  │  │   path   │            │  │ │
│         ▼            ▼      ▼  │  └──────────┴────────────┘  │ │
│    Charts.vue  Commands Simula- │            │                 │ │
│    (Telemetry)  .vue   tions   │            │ setInterval×2  │ │
│         │               .vue  └────────────┼─────────────────┘ │
│         │                                  │                   │
│    ┌────┴────────┐                         │ REST polling       │
│    │ UUVViewer   │                         │ (5 s)             │
│    │ (Three.js)  │                         │                   │
│    └─────────────┘                         │                   │
└────────────────────────────────────────────┼───────────────────┘
                                             │ HTTP / JSON
                          ┌──────────────────▼──────────────────┐
                          │     Backend  http://localhost:8000   │
                          │                /api                  │
                          │                                      │
                          │  /commands/*   /depth/*              │
                          │  /pose/*       /pressure/*           │
                          │  /leakage/*    /alive/*              │
                          │  /mission-profiles/*                 │
                          │  /simulation/* (stub)                │
                          └──────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Vue 3 | ^3.x | Composition API, `<script setup>` throughout |
| Language | TypeScript | ^5.x | Strict mode; all types in `src/types/` |
| Build tool | Vite | 5.x | Dev server on port 3000 |
| State management | Pinia | ^2.x | One store per domain |
| UI component library | Vuetify | 3.x | Custom `nautilus` theme; heavily overridden |
| Charting | Chart.js + vue-chart-3 | 3.x / 2.x | Line chart for depth over time |
| 3D rendering | Three.js + OrbitControls | r1xx | AUV attitude viewer |
| Drag-and-drop | vuedraggable | 4.x | Path segment waypoint reordering |
| Date/time | Luxon | 3.x | Timestamp parsing and display |
| Icons | Material Design Icons | (@mdi/font) | Used via Vuetify |
| Fonts | Google Fonts | — | Orbitron, Exo 2, Inter, JetBrains Mono |

---

## Design Principles

### 1. CSS Custom Property Theming

All colors are declared as CSS custom properties on `:root` (light) and `html.dark` (dark). No hardcoded hex values appear in component `<style>` blocks. This creates a single source of truth: swapping the theme class on `<html>` is sufficient to repaint the entire UI, including the Three.js canvas (which watches a prop and re-applies materials on change).

**Rationale:** Vuetify's internal theming system conflicts with component-level overrides in non-trivial ways. Bypassing it with plain CSS custom properties gives predictable results and avoids specificity battles with generated Vuetify CSS.

### 2. No Vuetify Component Nesting

`SimpleCardWrapper` uses a plain `<div>` rather than `<v-card>`. Panel containers never wrap Vuetify components inside other Vuetify surface components.

**Rationale:** `<v-card>` inside `<v-card>` causes Vuetify's variant and color inheritance to cascade unpredictably. Plain `<div>` elements with custom properties sidestep this entirely.

### 3. Flat, Functional Aesthetic

Panels are white/dark surfaces with 1 px borders, 7–9 px border radii, and no box shadows. The visual language is deliberately sparse — inspired by technical plotting interfaces rather than material design surfaces.

**Rationale:** Operators using this system in a monitoring context benefit from high information density and low visual noise. Shadows and elevation cues add depth metaphor that distracts from data.

### 4. Semantic Font Scale

Four fonts are used with specific, non-interchangeable roles:

| Font | Weight | Role |
|---|---|---|
| Orbitron | 900 | NAUTILUS brand wordmark only |
| Exo 2 | 500 | Large numeric readouts, section headings |
| Inter | 400 | All readable prose UI text |
| JetBrains Mono | 400 | IDs, timestamps, raw data values |

**Rationale:** Mixing a display font (Orbitron), a geometric numeric font (Exo 2), and a legible sans-serif (Inter) gives each UI layer a distinct visual register without creating inconsistency. Monospace for IDs and timestamps prevents layout shift as values update.

### 5. Polling Over WebSocket

Data is fetched via `setInterval` at 5-second intervals using `/load-new` endpoints that accept a timestamp parameter. There is no persistent connection.

**Rationale:** Polling requires no server-side connection management, no reconnection logic, and no protocol negotiation. For an AUV with a ~5 s acceptable telemetry latency, polling is operationally equivalent to streaming and significantly simpler to deploy.

### 6. Client-Side ID Generation

Path segment IDs are generated with `crypto.randomUUID()` in the browser. The backend never assigns these IDs.

**Rationale:** Eliminates a round-trip to create a segment before the user has entered any data. The UUID space is large enough that collisions are not a concern in practice.

### 7. Separation of Concerns — Stores Own All I/O

Pinia stores own all fetch calls, polling intervals, and data mutation. View components and sub-components call store actions and read store state; they do not perform any direct API calls.

**Rationale:** Keeps components purely presentational, makes the data layer independently testable, and provides a single place to audit all backend communication.

### 8. Progressive Disclosure for WIP Features

The "Sophisticated" dive profile type is present in the UI as a selector option with a WIP tag. Its editor panel renders a placeholder. No backend calls are made for it.

**Rationale:** Ships the UX scaffold so stakeholders can see where the feature will live, without blocking delivery on incomplete backend work. The selector state is already wired; connecting real functionality requires only filling in the editor component.

### 9. Three.js Isolated from Vue Reactivity

Three.js objects (scene, camera, renderer, mesh) are stored in plain `let` variables at module scope within the component, not in `ref` or `reactive`. Only two props feed into watchers: the current theme string and the quaternion from the pose store.

**Rationale:** Vue's reactivity system proxies objects assigned to `ref`. Three.js objects contain circular references and non-plain properties that Vue cannot proxy safely. Keeping them outside reactivity prevents runtime errors and unintentional deep-watch overhead on large scene graphs.

---

## Theming System

### CSS Custom Properties

All design tokens are declared in `src/styles/global.css`:

```css
:root {
  --color-background: #ffffff;
  --color-surface: #f5f7fa;
  --color-border: #e0e4eb;
  --color-text-primary: #1a1d23;
  --color-text-secondary: #6b7280;
  /* ... additional tokens */
}

html.dark {
  --color-background: #0f1117;
  --color-surface: #1a1d23;
  --color-border: #2d3140;
  --color-text-primary: #e8eaf0;
  --color-text-secondary: #9ca3af;
  /* ... */
}
```

Vuetify's own `--v-theme-*` variables are also overridden inside `html.dark` to prevent the library from re-painting components with its default dark theme colors.

### Dark Mode Toggle

`src/composables/useTheme.ts` exports a singleton composable:

- On first call, reads `localStorage.getItem('nautilus-theme')`.
- Falls back to `window.matchMedia('(prefers-color-scheme: dark)')`.
- Toggles the `dark` class on `document.documentElement`.
- Persists the preference back to `localStorage` under the key `nautilus-theme`.

The AppBar calls `useTheme()` and binds a toggle button to the returned `toggle()` function.

### Font Loading

Fonts are imported via Google Fonts `@import` at the top of `global.css`. No build-time font processing is required.

---

## State Management

### `datalogs.ts`

Owns all sensor telemetry. Populated on mount by `loadDataLogs()` (calls all six `/load` endpoints) and kept current by `checkForNewData()` (calls all six `/load-new` endpoints with the latest `record_datetime` as a cursor).

| State key | Type | Description |
|---|---|---|
| `depths` | `DepthLog[]` | Current and historical depth readings |
| `targetDepths` | `DepthLog[]` | Commanded target depth readings |
| `poses` | `PoseLog[]` | 6-DOF pose: x, y, z, qw, qx, qy, qz |
| `pressures` | `PressureLog[]` | Pressure readings; filtered by `location` in components |
| `leakages` | `LeakageLog[]` | Leak sensor readings; filtered by `location` in components |
| `alives` | `AliveLog[]` | Heartbeat / system alive flag |

All arrays are capped at 100 records. New records are prepended; the array is sliced after each insert.

**Key actions:**
- `loadDataLogs()` — full initial load, called once on mount.
- `checkForNewData()` — polling tick, called every 5 s.
- `resetLeak()` — client-side workaround; sets `has_leak` to `false` in local state without a backend call.

### `commands.ts`

Owns the command history and command dispatch.

| State key | Type | Description |
|---|---|---|
| `commands` | `Command[] \| null` | All commands, newest first. `null` before first load. |
| `commandIdSet` | `Set<string>` | Deduplication index for merge-insert |

**Key actions:**
- `baseLoad()` — loads initial command history on mount.
- `extendedLoad({ done })` — infinite-scroll callback; loads older records.
- `insertCommands(newCommands)` — merges new records into the sorted list without duplicates.
- `checkForNew()` — polling tick; fetches commands newer than the latest known timestamp.
- `sendCommand(type, data?)` — POSTs to `/commands/create`.

### `missions.ts`

Owns saved dive profiles (the legacy depth+pause waypoint system).

| State key | Type | Description |
|---|---|---|
| `missions` | `Mission[]` | All saved mission profiles |
| `selectedMissionId` | `string \| null` | ID of the mission currently active in the editor |

**Computed:** `currentMission` — derives the `Mission` object from `selectedMissionId`.

**Key actions:**
- `loadMissions()` — GET `/mission-profiles/load`, called once on mount.
- `createMission()` — POST create, auto-selects the new mission.
- `updateMission()` — POST update with current name and waypoints.
- `deleteMission()` — POST delete; blocked client-side when only one mission exists.
- `sendCurrentMission()` — dispatches a `Mission_Profile` command containing the selected mission's data.

### `path.ts`

Owns the naive path editor state (x, y, z coordinate waypoints).

| State key | Type | Description |
|---|---|---|
| `segments` | `PathSegment[]` | Named path segments, each with an array of `PathPoint` |

Segment IDs are generated client-side with `crypto.randomUUID()`. Points within a segment have sequential numeric IDs used by vuedraggable for stable keying.

### `simulations.ts`

Owns simulation configuration and runtime state.

| State key | Type | Description |
|---|---|---|
| `config` | `SimulationConfig` | Model type, speed, maxDepth, updateRate, notes |
| `isRunning` | `boolean` | Whether a simulation is currently active |
| `overlayEnabled` | `boolean` | Whether the simulated depth trace overlays the telemetry chart |
| `simDepths` | `DepthLog[]` | Simulated depth readings from `/simulation/depth/load-new` (stub) |
| `lastRun` | `string \| null` | ISO timestamp of the last simulation start |

---

## Data Flow

```
Backend REST API
      │
      │  GET /depth/load-new?after=<timestamp>
      │  GET /pose/load-new?after=<timestamp>
      │  ... (6 sensor endpoints, every 5 s)
      ▼
datalogs store  ──── insertions ──→  depths[], poses[], pressures[], ...
      │
      │  (reactive ref / computed)
      ▼
Charts.vue
  ├── sensor metric cards  (read depths[0], poses[0], pressures, leakages, alives)
  ├── Depth over Time chart  (reads depths.slice(0,30))
  └── UUVViewer.vue  (receives :quaternion prop from poses[0])


Backend REST API
      │
      │  GET /commands/load-new?after=<timestamp>  (every 5 s)
      ▼
commands store  ──── insertCommands() ──→  commands[]
      │
      │  (reactive ref)
      ▼
CommandHistoryPanel.vue  (reads commands[], infinite scroll via extendedLoad)


Operator action  (e.g. click ABORT)
      │
      ▼
CommandBtnPanel.vue  ──→  commands store.sendCommand('Abort')
                                │
                                │  POST /commands/create
                                ▼
                          Backend (enqueues command)
```

---

## API Contract

Base URL: `http://localhost:8000/api`

### Commands

| Method | Endpoint | Query / Body | Response shape |
|---|---|---|---|
| GET | `/commands/load` | — | `Command[]` |
| GET | `/commands/load-new` | `?after=<ISO timestamp>` | `Command[]` |
| POST | `/commands/create` | `{ command, data? }` | `Command` |

### Sensor Data (pattern repeats for each type)

| Method | Endpoint | Query | Response shape |
|---|---|---|---|
| GET | `/depth/load` | — | `DepthLog[]` |
| GET | `/depth/load-new` | `?after=<ISO timestamp>` | `DepthLog[]` |
| GET | `/target_depth/load` | — | `DepthLog[]` |
| GET | `/target_depth/load-new` | `?after=<ISO timestamp>` | `DepthLog[]` |
| GET | `/pose/load` | — | `PoseLog[]` |
| GET | `/pose/load-new` | `?after=<ISO timestamp>` | `PoseLog[]` |
| GET | `/pressure/load` | — | `PressureLog[]` |
| GET | `/pressure/load-new` | `?after=<ISO timestamp>` | `PressureLog[]` |
| GET | `/leakage/load` | — | `LeakageLog[]` |
| GET | `/leakage/load-new` | `?after=<ISO timestamp>` | `LeakageLog[]` |
| GET | `/alive/load` | — | `AliveLog[]` |
| GET | `/alive/load-new` | `?after=<ISO timestamp>` | `AliveLog[]` |

### Mission Profiles

| Method | Endpoint | Body | Response shape |
|---|---|---|---|
| GET | `/mission-profiles/load` | — | `Mission[]` |
| POST | `/mission-profiles/create` | `{ name, waypoints }` | `Mission` |
| POST | `/mission-profiles/update` | `{ mission_id, name, waypoints }` | `Mission` |
| POST | `/mission-profiles/delete` | `{ mission_id }` | `{ ok: true }` |

### Simulation (stub — backend not yet implemented)

| Method | Endpoint | Body | Response shape |
|---|---|---|---|
| POST | `/simulation/start` | `SimulationConfig` | `{ ok: true }` |
| POST | `/simulation/stop` | — | `{ ok: true }` |
| GET | `/simulation/depth/load-new` | `?after=<ISO timestamp>` | `DepthLog[]` |

### Expected Type Shapes

```typescript
// Commands
type CommandTypes  = 'Mission_Profile' | 'Start' | 'Stop' | 'Pause' | 'Abort'
type CommandStatus = 'queued' | 'acknowledged' | 'failed'

interface Command {
  command_id: string            // UUID
  command: CommandTypes
  status: CommandStatus
  send_retries: number
  last_update_datetime: string  // ISO 8601
}

// Sensor logs (all extend DatabaseLog)
interface DatabaseLog { record_datetime: string; log_id: string }

interface DepthLog    extends DatabaseLog { depth: number }
interface PoseLog     extends DatabaseLog { x: number; y: number; z: number; qw: number; qx: number; qy: number; qz: number }
interface PressureLog extends DatabaseLog { pressure: number; location: 'hull' | 'tank' | 'ext' }
interface LeakageLog  extends DatabaseLog { has_leak: boolean; location: 'front' | 'back' }
interface AliveLog    extends DatabaseLog { is_alive: boolean }

// Missions
interface Waypoint { id?: number; depth: number; pause_duration: number }
interface Mission  { mission_id: string; name: string; waypoints: Waypoint[] }

// Naive path
interface PathPoint   { id: number; x: number; y: number; z: number }
interface PathSegment { segment_id: string; name: string; points: PathPoint[] }

// Simulation config
interface SimulationConfig {
  model: 'constant_velocity' | 'waypoint_following' | 'pid_depth'
  speed: number       // m/s
  maxDepth: number    // m
  updateRate: number  // Hz
  notes: string
}
```

---

## Component Hierarchy

```
App.vue
└── Default.vue  (layout)
    ├── AppBar.vue
    │   ├── Logo + wordmark (Orbitron)
    │   ├── Nav links  (/ | /commands | /simulations)
    │   └── Theme toggle button
    └── View.vue  (v-main wrapper)
        └── <router-view>
            ├── Charts.vue  (route: /)
            │   ├── Sensor metric cards  (inline, 10 panels)
            │   │   ├── Depth card
            │   │   ├── Target Depth card
            │   │   ├── Pressure cards  (hull, tank, ext)
            │   │   ├── Timestamp card
            │   │   ├── Position card  (x, y, z)
            │   │   ├── Orientation card  (qw, qx, qy, qz)
            │   │   ├── Leakage card  (badge + reset)
            │   │   └── System Alive card
            │   ├── Viz row
            │   │   ├── Depth over Time  (Chart.js line chart)
            │   │   └── UUVViewer.vue  (Three.js)
            │   └── Right sidebar  (230 px)
            │       ├── Visualizations toggles
            │       ├── Sensor Panel toggles
            │       └── Simulation section
            │
            ├── Commands.vue  (route: /commands)
            │   ├── CommandBtnPanel.vue      (Quick Actions)
            │   ├── CommandProfilePanel.vue  (Dive Profile Editor)
            │   │   └── NaivePathEditor.vue  (when type = Naive)
            │   └── CommandHistoryPanel.vue  (Command History, full-height right column)
            │
            └── Simulations.vue  (route: /simulations)
                ├── Left column: config form (model, speed, maxDepth, updateRate, notes)
                └── Right column: status panel + Start/Stop/Clear controls + About panel
```

---

## Three.js Integration Notes

### Setup

`UUVViewer.vue` creates its Three.js scene inside `onMounted`. The renderer is attached to a `<canvas>` element referenced via `templateRef`. An `AnimationFrameId` is stored so the loop can be cancelled with `cancelAnimationFrame` on `onUnmounted` to prevent memory leaks.

### Object Storage

The scene, camera, renderer, mesh, and OrbitControls instances are stored in plain module-level `let` variables — not `ref` or `reactive`. This is mandatory; Vue's Proxy-based reactivity system cannot handle Three.js objects.

### Reactivity Bridge

Two watchers connect Vue state to Three.js:

1. **Quaternion watcher** — watches the `quaternion` prop (passed from `poses[0]` in Charts.vue). On change, calls `mesh.quaternion.set(qx, qy, qz, qw)` and triggers a render.
2. **Theme watcher** — watches the `theme` prop. On change, updates `scene.background`, mesh material colors, and grid helper colors to match the current CSS custom property values.

### Camera Controls

- Orbit is implemented with Three.js `OrbitControls` (mouse left-drag).
- Zoom uses `+` / `−` buttons that adjust `camera.position` along the Z axis. Zoom range is clamped between `DEFAULT_DIST / 2` and `DEFAULT_DIST * 2` (default distance: 7 m).

### HUD Overlay

Roll, Pitch, Yaw, and Depth are computed from the quaternion in a `computed` property and rendered as an HTML overlay positioned absolutely over the canvas.

---

## Build and Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Backend running at `http://localhost:8000`

### Commands

```bash
# Install dependencies
npm install

# Start development server (port 3000, hot reload)
npm run dev

# Type-check
npm run type-check

# Build for production
npm run build

# Preview production build
npm run preview
```

### Environment

The backend base URL is hardcoded in `src/assets/api_requests.ts`. To point at a different backend, change the `BASE_URL` constant in that file. There is no `.env` file for this value at present.

---

## Known Limitations and Planned Improvements

### Known Limitations

| Area | Limitation |
|---|---|
| Transport | Polling at 5 s intervals means up to 5 s latency for new telemetry. Real-time monitoring of fast events (e.g. leak onset) is delayed. |
| Leak reset | `resetLeak()` mutates client state only. A page refresh restores the server-side `has_leak` value. |
| Sophisticated path editor | The "Sophisticated" profile type (closed-loop waypoint following with heading) has no editor implementation. Selecting it shows a WIP placeholder. |
| Simulation backend | The `/simulation/*` endpoints are stubbed. Starting a simulation sends a POST but no real model runs and no simulated depth data is returned. |
| Mission profile system | The legacy depth+pause `Mission` / `Waypoint` system and the newer `PathSegment` / `PathPoint` system coexist without a migration path. |
| Error handling | API errors are logged to the console but not surfaced to the operator in the UI (no toast or error banner). |
| Authentication | No authentication or authorization layer exists. The UI assumes it is running on a trusted local network. |

### Planned Improvements

- Replace polling with WebSocket or Server-Sent Events for sub-second telemetry latency.
- Implement the Sophisticated path editor (heading-aware waypoints, closed-loop profiles).
- Wire the simulation backend and surface simulated depth data in the overlay.
- Add a unified notification system (toasts) for API errors, command acknowledgement, and leak events.
- Migrate or deprecate the legacy `missions.ts` / depth+pause system in favour of `path.ts`.
- Add operator authentication (session token or local PIN).
- Persist sidebar toggle states across sessions via `localStorage`.
