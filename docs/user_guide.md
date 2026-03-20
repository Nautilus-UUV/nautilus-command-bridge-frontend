# NAUTILUS Command Bridge — User Guide

## What is NAUTILUS Command Bridge?

NAUTILUS Command Bridge is the operator interface for an autonomous underwater vehicle (AUV/UUV). It provides:

- **Live telemetry** — depth, position, orientation, pressure, leakage, and system health updated every 5 seconds.
- **Command dispatch** — send Start, Stop, Pause, and Abort commands to the vehicle; load and execute dive profiles.
- **Dive profile authoring** — create, edit, and manage waypoint-based dive profiles; import and export paths as CSV.
- **Simulation** — configure and run simulation models that overlay synthetic data on the telemetry charts.

The application runs in a browser at `http://localhost:3000`. It requires the NAUTILUS backend to be running at `http://localhost:8000`.

---

## Quick Start

1. Ensure the NAUTILUS backend is running at `http://localhost:8000`.
2. Open `http://localhost:3000` in a modern browser (Chrome, Firefox, or Edge recommended).
3. The **Telemetry** tab loads by default. Sensor cards will populate within 5 seconds as the first poll completes.
4. Use the navigation links in the top bar to switch between Telemetry, Commands, and Simulations.

---

## Navigation

The application bar (AppBar) is always visible at the top of the screen. It contains:

| Element | Location | Function |
|---|---|---|
| NAUTILUS wordmark | Left | Decorative; clicking does not navigate |
| **Telemetry** link | Centre | Navigate to the telemetry dashboard (`/`) |
| **Commands** link | Centre | Navigate to the command control centre (`/commands`) |
| **Simulations** link | Centre | Navigate to simulation configuration (`/simulations`) |
| Theme toggle | Right | Switch between light and dark mode |

### Dark Mode

Click the theme toggle button (sun/moon icon) to switch between light and dark mode. The preference is saved in your browser and will persist across page reloads. If you have not previously set a preference, the application follows your operating system's colour scheme setting.

---

## Telemetry Tab

The Telemetry tab (`/`) is the primary monitoring view. It is divided into three regions: the **sensor metric cards** across the top, the **visualisation row** in the middle, and the **sidebar** on the right.

### Sensor Metric Cards

Ten cards span the full width of the page, each displaying a specific sensor reading. Cards refresh automatically every 5 seconds.

| Card | Displayed values | Notes |
|---|---|---|
| **Depth** | Current depth in metres | Large display (42 px); shown in Exo 2 |
| **Target Depth** | Commanded target depth in metres | Large display; indicates where the vehicle is trying to go |
| **Hull Pressure** | Pressure inside the vehicle hull | Medium display (28 px) |
| **Tank Pressure** | Pressure in the buoyancy tank | Medium display |
| **Ext Pressure** | Ambient external water pressure | Medium display |
| **Timestamp** | Time of the most recent depth record | Monospace; format HH:mm:ss.SSS |
| **Position** | x, y, z coordinates | Three-value grid layout |
| **Orientation** | Quaternion components qw, qx, qy, qz | Four-value grid; used to drive the 3D viewer |
| **Leakage** | Leak detected (Yes/No), location, last leak time | Includes a Reset button |
| **System Alive** | Online / Offline indicator | Green dot = alive, red dot = offline |

#### Leakage Reset

If a leak is detected and subsequently resolved (physically repaired or confirmed as a false positive), press the **Reset** button on the Leakage card to clear the leak flag in the interface. Note that this is a client-side reset only — it does not write to the backend. Reloading the page will restore the server-side value.

### Visualisation Row

The visualisation row sits below the metric cards and displays two panels side by side. If one panel is hidden via the sidebar, the remaining panel expands to fill the full width.

#### Depth over Time Chart

A line chart showing the vehicle's depth over the last 30 readings. The Y-axis runs from 0 to −100 m (downward positive). The X-axis shows timestamps in HH:mm:ss.SSS format.

When a simulation is running and the overlay is enabled, a second dashed orange line appears on the chart representing the simulated depth trace.

#### 3D Attitude Viewer

An interactive 3D representation of the vehicle's current orientation. The model is an ellipsoid that rotates in real time as quaternion data arrives from the pose sensor.

**Controls:**

| Action | Input |
|---|---|
| Orbit (rotate view) | Left-click and drag on the canvas |
| Zoom in | Click the **+** button (overlay, top-right of viewer) |
| Zoom out | Click the **−** button (overlay, top-right of viewer) |

Zoom range is limited from half to double the default camera distance (approximately 3.5 m to 14 m). The HUD overlay in the bottom-left corner of the viewer shows the computed Roll, Pitch, Yaw (in degrees), and current Depth.

The viewer updates its colours automatically when you switch between light and dark mode.

#### Adding a custom UUV model

The built-in model is a procedural ellipsoid. If you want to display a different vehicle shape you can swap it out for any glTF 2.0 binary (`.glb`) file.

**Step 1 — place the file**

Copy your `.glb` file into `public/models/`:

```
public/
  models/
    my_vehicle.glb
```

Files in `public/` are served verbatim at the root URL, so at runtime the file is available at `/models/my_vehicle.glb`.

**Step 2 — check the axis orientation**

The viewer expects:

| Axis | Direction |
|---|---|
| +X | Vehicle nose (forward) |
| +Y | Up (dorsal) |
| +Z | Starboard |

If your model uses a different convention, apply a corrective rotation on export (most DCC tools and Blender's glTF exporter let you choose the forward/up axes at export time).

**Step 3 — load the model in `UUVViewer.vue`**

Open `src/components/UUVViewer.vue`. Add the GLTFLoader import at the top of the `<script setup>` block:

```ts
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
```

Inside `buildScene()`, replace the procedural body/nose/fin geometry block with a loader call:

```ts
const loader = new GLTFLoader()
loader.load('/models/my_vehicle.glb', (gltf) => {
  uuvMesh = gltf.scene.children[0] as THREE.Mesh  // adjust index if needed
  scene.add(uuvMesh)
})
```

`uuvMesh` is the object that receives the quaternion rotation each frame, so the loaded root mesh must be assigned to it.

**Step 4 — update `updateColors()`**

The colour-update function references `uuvMesh.material` and `uuvMesh.children[0]` for the nose. If your loaded model has a different structure you will need to adjust those references (or remove them if the model carries its own materials that should not be overridden).

> **Tip:** The `public/models/README.md` file in the repository repeats these orientation conventions for quick reference without opening the source code.

### Right Sidebar

The sidebar is fixed at 230 px wide and is always visible. It contains three collapsible sections.

#### Visualizations

| Toggle | Effect |
|---|---|
| Depth Chart | Show or hide the Depth over Time chart |
| 3D Attitude | Show or hide the 3D attitude viewer |

Hiding one visualisation causes the other to expand and fill the full visualisation row.

#### Sensor Panels

Individual toggles for each of the 10 sensor metric cards. Use these to declutter the display when only specific sensors are relevant to the current operation.

#### Simulation

- **Overlay toggle** — enable or disable the simulated depth trace on the Depth over Time chart. The overlay requires a simulation to be active (see the Simulations tab).
- **Configure →** — link to the Simulations tab.

---

## Commands Tab

The Commands tab (`/commands`) is the mission control centre. It uses a two-column layout on wide screens and a single column on narrow screens (below 960 px).

### Quick Actions Panel (top left)

This panel provides immediate control over the vehicle.

#### Dive Profile Selector

The dropdown list shows all saved dive profiles by name. Select a profile before clicking **Load to UUV**.

#### Load to UUV

Sends a `Mission_Profile` command to the vehicle containing the full waypoint data of the selected profile. The command will appear in the Command History panel with status `queued` until the vehicle acknowledges it.

#### Start / Stop

- **Start** — sends a `Start` command. Use after loading a profile to begin execution.
- **Stop** — sends a `Stop` command. Halts the current mission in an orderly manner.

#### ABORT

The **ABORT** button is displayed prominently in red and spans the full width of the panel. Clicking it sends an `Abort` command immediately, without confirmation. Use this to halt all vehicle activity in an emergency.

---

### Dive Profile Editor Panel (bottom left)

The editor lets you create and modify the waypoint paths that are sent to the vehicle.

#### Profile Type Selector

Two types are available:

| Type | Status | Description |
|---|---|---|
| **Naive** | Available | Relative-coordinate x, y, z waypoint segments |
| **Sophisticated** | WIP | Heading-aware closed-loop profiles (not yet implemented) |

Select **Naive** for all current operational use. The Sophisticated option shows a work-in-progress placeholder.

#### Naive Path Editor

The Naive path editor organises waypoints into named **segments**. Each segment is a tab in the editor.

**Segment tabs**

- Click a tab to switch to that segment.
- The segment name is editable; click the name in the tab or the name field and type a new one.
- Add a new segment using the **+** button to the right of the tabs.

**Waypoint table**

Each segment contains a table of waypoints with three coordinate columns:

| Column | Unit | Description |
|---|---|---|
| x | m | Relative east–west displacement |
| y | m | Relative north–south displacement |
| z | m | Relative depth displacement (positive = down) |

- Click any cell to edit the value.
- **Drag the handle** on the left side of a row to reorder waypoints within the segment.
- Click the **delete** (trash) icon on a row to remove that waypoint.
- Click **Add Point** at the bottom of the table to append a new waypoint at `(0, 0, 0)`.

#### CSV Workflow

The Naive Path Editor supports CSV import and export.

**Exporting a single segment:**

1. Switch to the segment tab you want to export.
2. Click **Export Segment CSV**.
3. The browser downloads a `.csv` file named after the segment.

**Exporting all segments:**

1. Click **Export All CSV**.
2. The browser downloads a single `.csv` file containing all segments concatenated.

**CSV format:**

```
name,My Segment Name
x,y,z
0.0,0.0,1.0
5.0,0.0,2.5
5.0,3.0,2.5
```

- The first row is optional: `name,<segment name>`. If omitted, the import uses a default name.
- The second row must be the header `x,y,z`.
- Each subsequent row is a waypoint.

**Importing a CSV:**

1. Click **Import CSV**.
2. Select a `.csv` file from your filesystem.
3. The editor creates a new segment (or replaces the active one, depending on the import mode) with the imported waypoints.

---

### Command History Panel (right column)

The Command History panel shows all commands that have been sent to the vehicle, newest first. It fills the full height of the right column.

**Each entry displays:**

| Element | Description |
|---|---|
| Status pill | Colour-coded: amber = queued/sent, green = acknowledged, red = failed |
| Retry count | Small icon showing how many times the command has been retransmitted |
| Command type | e.g. `Mission_Profile`, `Start`, `Abort` |
| Command ID | Full UUID in monospace |
| Timestamp | Time the command was last updated (HH:mm:ss) |

**Infinite scroll:** Scroll down within the panel to load older command records. The panel fetches additional records from the backend automatically as you reach the bottom.

---

## Simulations Tab

The Simulations tab (`/simulations`) lets you configure and run a simulation model. The simulated depth output can be overlaid on the Telemetry chart for comparison with live data.

> **Note:** The simulation backend is not yet fully implemented. The interface is functional but sending start/stop commands does not currently produce real simulation output.

### Left Column — Configuration

#### Model Selector

Choose the simulation model to run:

| Model | Description |
|---|---|
| **Constant Velocity** | Vehicle descends at a fixed speed until max depth, then ascends |
| **Waypoint Following** | Vehicle follows a sequence of depth waypoints |
| **PID Depth Control** | Vehicle uses a proportional–integral–derivative controller to track a target depth |

#### Parameters

| Parameter | Unit | Description |
|---|---|---|
| Speed | m/s | Descent/ascent velocity |
| Max Depth | m | Maximum depth the simulation will reach |
| Update Rate | Hz | How frequently the simulation emits a depth record |
| Notes | — | Free-text notes attached to this simulation run |

### Right Column — Controls and Status

#### Status Panel

- **Running indicator** — green dot when a simulation is active, grey dot when idle.
- **Status message** — brief description of current simulation state.
- **Last run timestamp** — ISO timestamp of the most recent simulation start.

#### Controls

| Button | Action |
|---|---|
| **Start** | Sends the current configuration to the backend and begins the simulation |
| **Stop** | Halts the running simulation |
| **Clear** | Resets the status display and clears any simulation depth data from the store |

#### About Panel

Describes how the simulation integrates with the telemetry overlay. The overlay is toggled from the Telemetry tab sidebar (Simulation section) or from the toggle switch in the left column of this tab.

### Enabling the Telemetry Overlay

1. Start a simulation using the **Start** button.
2. Navigate to the **Telemetry** tab.
3. In the right sidebar, expand the **Simulation** section and enable the overlay toggle.
4. The Depth over Time chart will display a second dashed orange line representing the simulated depth.

Alternatively, enable the overlay directly from the **Simulations** tab using the **Telemetry Overlay** toggle in the left column, then click **Configure →** to open the Telemetry view.

---

## Tips

- **Sensor cards not updating?** Verify the backend is running at `http://localhost:8000`. Check the browser console for network errors. The polling interval is 5 seconds, so allow at least one full cycle after the backend starts.

- **Leakage card shows a leak after it was fixed?** Press the **Reset** button on the Leakage card. This clears the flag in the interface. Note: the reset is client-side only and will revert on page reload until the backend record is updated.

- **Command sent but not acknowledged?** The `send_retries` count on the Command History entry will increment as the backend retries delivery. A status of `failed` means the vehicle did not acknowledge after the maximum retry count.

- **3D viewer appears blank or black?** The viewer requires WebGL support. Ensure your browser and graphics drivers support WebGL 2. Try switching themes — a theme change forces the viewer to re-initialise its materials.

- **Drag-and-drop reordering not working?** Ensure you are clicking and holding the drag handle (the icon on the left side of each row), not the data cells.

- **CSV import creates unexpected segments?** Check that your CSV file uses the exact format described above: optional `name,` row, then `x,y,z` header, then data rows. Rows with non-numeric values will be skipped.

- **Dark mode resets on reload?** The theme preference is stored in your browser's `localStorage` under the key `nautilus-theme`. If your browser is set to clear site data on close, the preference will not persist.

- **Visualisation panels overlapping on small screens?** The Commands view switches to a single-column layout below 960 px. The Telemetry sidebar remains fixed — on very narrow viewports, consider hiding unused sensor cards via the sidebar toggles to reclaim vertical space.
