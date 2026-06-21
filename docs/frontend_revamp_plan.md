# Frontend Revamp — Single-Page Mission-Control Dashboard

## Context

`nautilus-command-bridge-frontend/` currently has four routed tabs — **Telemetry**
(`Charts.vue`), **Commands**, **Simulations**, **Debug** — plus a Controller/Viewer
mode switch and a top-bar nav. The operator wants a **single SpaceX-style page** that
collapses everything down to a revamped Commands view: a central 3-D UUV model inside a
gyroscope sphere, surrounded by circular gauges, depth/valve readouts, the liveness
panel, the manual/debug controls, and the automatic dive-profile picker.

This is a **looks-only** change. Every ROS-facing connection (MQTT publishes for
commands, MQTT-WS telemetry/liveness subscriptions) stays **byte-for-byte identical** —
we only re-layout, re-skin, add new display widgets, and re-colour. The user will
iterate on the visuals with screenshots during implementation, so this plan fixes
structure + wiring + data ranges and leaves pixel polish to the loop.

Decisions locked with the user:
- **Strip charts removed entirely** — the 4 circular gauges + depth/valve readouts are
  the only live numeric display. The `chart.js` / `vue-chart-3` stack goes away.
- **Top bar = brand + theme toggle only** — remove the nav, the Controller/Viewer mode
  switch, and the m/Pa unit toggle (depth shows both m and Pa inline).

---

## Target layout

Single page, three columns. The centre column is the "stage": a fluid gauge row on top,
and below it a band where the UUV model is **flanked symmetrically** — depth+valves on its
left edge, the compact liveness strip on its right edge (mirror image, minimal footprint,
like the reference screenshot's tight "CONNECTIONS" list).

```
┌──────────────┬───────────────────────────────────────────────┬──────────────┐
│              │   [RPM] [PITCH] [ROLL] [TANK]  … (fluid →)      │              │
│  EMERGENCY   │  ┌──────┬───────────────────────┬──────────┐   │  AUTOMATIC   │
│  SURFACE     │  │depth │                       │ Tether ● │   │  DIVE        │
│  (slide)     │  │7.4 m │   UUV model inside    │ ACU·P  ● │   │  PROFILE     │
│              │  │(75383│   gyroscope sphere     │ ACU·R  ● │   │              │
│  MANUAL /    │  │ Pa)▲ │   (static orient.)    │ Pump   ● │   │  (trim /     │
│  DEBUG       │  │      │                       │ V1/V2  ● │   │   sawtooth / │
│  COMMANDS    │  │ V1 ● │                       │ IMU L/R● │   │   surface)   │
│              │  │ V2 ○ │                       │ Ext/Tnk● │   │              │
│  reset       │  └──────┴───────────────────────┴──────────┘   │              │
└──────────────┴───────────────────────────────────────────────┴──────────────┘
   col-left                    col-center (stage)                   col-right
                     depth/valves │  model  │ liveness(compact)
```

- **col-left** (`~280px`): `EmergencySurfaceButton` (top, prominent) → `DebugCommandsPanel`
  (manual pump / valves / ACU) → `ResetButton` (bottom, **subtle**).
- **col-center** (`flex:1`): top = the **fluid gauge row**; below = a 3-part flex band —
  **depth+valves** strip (left edge) │ `UUVViewer` gyroscope (flex:1, centre) │ **compact
  liveness** strip (right edge). The two flanking strips are styled as a near-symmetric
  pair (same width band, same vertical rhythm) so the model reads as centred.
- **col-right** (`~300px`): `CommandProfilePanel` (automatic dive profiles) — liveness no
  longer lives here.

Root is `display:flex`; each column is an internal `flex-direction:column`. Below a
`~1100px` breakpoint the columns wrap/stack and the two flank strips drop below the model.

---

## Work items

### 1. New component — `src/components/CircularGauge.vue`
Reusable SVG arc gauge (~270° sweep), value in the centre, label below, matching the
screenshot's "circular filling" readouts. Props:
`value: number | null`, `min`, `max`, `label`, `unit?`, `signed?: boolean`, `decimals?`,
`trend?: 'up' | 'down' | 'flat'`.
- `fraction = clamp((value - min) / (max - min), 0, 1)` (handles `min>max`, e.g. pitch `0 → -119.5`).
- `signed:true` → baseline arc at the angle of `value=0`, fill grows out from there
  (used for RPM and roll, which straddle 0); `signed:false` → fill from the `min` end.
- Null value → dashes, empty track. Colours from CSS vars (`--accent`, a new
  `--gauge-track`); single cyan accent across all four for the minimalist look.
- **Trend triangle**: render a small `▲` (green, `--status-ok-text`) when `trend==='up'`,
  `▼` (red, `--status-err-text`) when `'down'`, and a muted dash / nothing when `'flat'`,
  next to the centre value.

### 1b. Trend computation — `src/composables/useTrend.ts` (small helper)
Each telemetry stream is a newest-first ring buffer, so trend is cheap to derive.
`trendOf(series, { back = 5, eps })` → compares `series[0].value` against `series[back].value`
(a few samples back, ~1 s at 5 Hz, to debounce jitter) and returns `'up' | 'down' | 'flat'`
using a small per-signal `eps` deadband so a steady value doesn't flicker. The dashboard
computes one trend per signal from the store buffers (`bcuRpm`, `acuPitch`, `acuRoll`,
`bcuPressure`, `externalPressure`) and passes it as the `trend` prop to each gauge **and**
to the depth readout. **Applies to all four gauges and the depth number.**

**Fluid / extensible row.** The gauges are **data-driven**: the dashboard builds an array
of gauge specs (`{ key, label, value, min, max, signed, unit, trend }`) and `v-for`s them
into a responsive container — `display:flex; flex-wrap:wrap` (or
`grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`) so the row grows/reflows
cleanly as gauges are added. Adding **temperature** (or any future metric) later = push one
spec object + wire its accessor; no layout surgery. Gauges have a sensible min width and
shrink/wrap rather than squashing.

The initial four gauges (latest sample read **directly** from `useTelemetryStore`, no chart
composable):

| Gauge | Accessor (`storeToRefs(useTelemetryStore())`) | min | max | signed | unit | notes |
|-------|-----------------------------------------------|-----|-----|--------|------|-------|
| RPM         | `bcuRpm.value[0]?.value`    | −4000 | 4000 | yes | RPM  | `BCU_MOTOR_MAX_RPM=4000` |
| ACU Pitch   | `acuPitch.value[0]?.value`  | 0 | −119.5 | no  | mm   | trim sled travel `ACU_PITCH_MAX_TRAVEL_M=0.1195` |
| ACU Roll    | `acuRoll.value[0]?.value/100` | −30 | 30 | yes | °    | wire is centideg; `ACU_ROLL_MAX_ANGLE_DEG=30` |
| Tank press. | `bcuPressure.value[0]?.value` | 0 | 200000 | no | Pa (shown as kPa in dial) | user-specified range |

### 2. New widget — depth + valve readout (`DepthValveReadout.vue`, or inline in the view)
Narrow vertical strip on the left edge of the centre stage. Reads-only:
- **Depth**: big number `paToDepthM(externalPressure.value[0]?.value)` from
  `@/composables/useUnits` → `"7.42 m"`, with raw absolute Pa under it `"(75383 Pa)"`,
  plus the same **trend triangle** (▲ green increasing / ▼ red decreasing) driven by
  `useTrend` on the `externalPressure` buffer.
- **2 valve indicators**: from `bcuValves.value[0]?.value` — `V1 Empty Pathway` (bit1),
  `V2 Motor` (bit0); green dot when open, muted when closed. Mirrors the bit semantics in
  `DebugCommandsPanel.vue` (read-only here; the actual toggles stay in the debug panel).

### 2b. Compact liveness strip — restyle `SubsystemHealthPanel.vue` (right flank of the stage)
Liveness moves **out of the right column** to the **right edge of the centre stage**,
mirroring the depth+valves strip on the left (near-symmetric: same band width, minimal
footprint). Wiring unchanged (`useLivenessStore` → `nautilus/status/liveness`, tether gate).
Redesign the rendering from 10 full-width label+badge rows to a **tight vertical list**:
each row = a small status dot (`--status-ok-text` / `--status-err-text` / muted) + a short
label, like the screenshot's "CONNECTIONS" list. Drop the `SimpleCardWrapper` chrome (or
use a borderless variant) so it reads as a slim instrument strip, not a boxed card. Pairs
of correlated subsystems (IMU L/R, Valve 1/2) may share a row to save height. Add a
`compact` prop (or a dedicated compact template) so the panel can still be reused elsewhere.

### 3. Enhance `src/components/UUVViewer.vue` — gyroscope sphere, static
- Add a **gyroscope group**: 3 orthogonal thin `TorusGeometry` rings + a faint
  `SphereGeometry` wireframe shell around the model (radius ≈ model bounding-sphere ×1.3),
  cyan/translucent. Remove `gridHelper` + `AxesHelper` for a clean look (`updateColors`
  loses the grid recreate).
- **Static orientation**: the view passes identity quaternion (`qw=1, qx=qy=qz=0`); keep
  the props interface so live IMU wiring is a one-line change later. Model + rings sit still.
- Remove the attitude **HUD overlay** (orientation is static; depth lives in the readout).
  Keep zoom buttons + drag-to-orbit. Update the canvas bg / ring colours to the new palette.

### 4. Repurpose the view — `src/views/Commands.vue` → the dashboard
Rewrite its template/style into the 3-column layout above, composing the kept panels +
new widgets. (Rename to `Dashboard.vue` for clarity, or keep the filename and just
re-point the route — either is fine; rename preferred.)

### 5. `src/router/index.ts` — collapse to one route
Single child route `path: ''` → the dashboard view. Drop the `commands`, `simulations`,
`debug` routes.

### 6. `src/layouts/default/AppBar.vue` — strip to brand + theme toggle
Remove `<nav>` links, the Controller/Viewer `mode-select`, the m/Pa `unit-btn`, and the
`useAppMode`/`useRoute` guard logic. Keep brand + `theme-btn`.

### 7. `src/composables/useTheme.ts` — default to dark
Default `isDark` to `true` when no stored preference (drop the OS-`prefers-color-scheme`
branch) so first load is the dark SpaceX look. Toggle still works.

### 8. `src/styles/global.css` — retune the **dark** palette toward cyan/teal
Only touch the `html.dark` block (light theme untouched). Shift `--accent` from the
current blue `#6090d8` to a cyan/teal (≈ `#35c9e0`), cool the backgrounds slightly
(`--bg` ≈ `#0a0e14`, `--bg-panel` ≈ `#0f141c`), de-purple the borders/`--text-muted`,
and add `--gauge-track` + `--accent-glow`. Keep every existing variable **name** (no
hardcoded hex in components — the "CSS custom properties, not Vuetify theming" rule).
Pixel values get tuned in the screenshot loop.

### Preserved wiring (must not change)
| Action | Call / topic (verbatim) |
|--------|--------------------------|
| Emergency surface | `mqtt.stopMission()` then `publish('nautilus/cmd/debug/emergency_surface', {data})` |
| Reset | `mqtt.resetAll()` → `cmd/command{false}` + `cmd/debug/reset{}` |
| Dive profile send/stop | `mqtt.startMission(cmd)` / `mqtt.stopMission()` (`cmd/path`, `cmd/command`) |
| Manual pump / valves / ACU | `mqtt.engageManual(() => publish(...))` on `cmd/debug/bcu/*`, `cmd/debug/acu/*` |
| Telemetry gauges/readouts | `useTelemetryStore` MQTT subs (unchanged) |
| Liveness panel | `useLivenessStore` / `nautilus/status/liveness` (unchanged) |

### Dead code to delete (orphaned by the revamp — per "delete unwired code")
- **Views**: `Charts.vue`, `Simulations.vue`, `Debug.vue`.
- **Components**: `CommandPanels/CommandGraphsPanel.vue`, `CommandPanels/CollapsibleChartPanel.vue`,
  `AttitudeIndicator.vue` (2-D horizon, replaced by 3-D gyroscope), `TelemetrySidebar.vue`,
  `CommandPanels/NaivePathEditor.vue`.
- **Composables**: `useTelemetryCharts.ts`, `useAppMode.ts`.
- **Stores**: `simulations.ts`, `path.ts`, `datalogs.ts` (REST, backend doesn't exist).
- **Types / assets**: `SimulationTypes.ts`, `PathTypes.ts`, `DatabaseTypes.ts`,
  `assets/api_requests.ts` — delete each only after confirming no remaining import
  (grep first; `MissionTypes.ts` likewise if unreferenced).
- Drop `chart.js`, `vue-chart-3`, `vuedraggable`, `luxon` from `package.json` deps **only
  if** nothing else imports them (grep first).

### Kept & lightly restyled (wiring intact)
`EmergencySurfaceButton.vue`, `ResetButton.vue` (→ subtle: ghost/muted, small, not a full
red fill), `DebugCommandsPanel.vue`, `CommandProfilePanel.vue`, `SubsystemHealthPanel.vue`,
`SimpleCardWrapper.vue`, `useUnits.ts` (`paToDepthM` powers the depth readout).

---

## Verification

1. `cd nautilus-command-bridge-frontend && npm run dev` (Vite, :3000). Page loads to the
   single dark dashboard; no console errors; no dead-route 404s.
2. `npm run build` (`vue-tsc --noEmit && vite build`) passes — confirms no dangling
   imports after the deletions and no TS errors.
3. **Visual iteration loop** (the user explicitly asked for this): screenshot the running
   page, compare to the reference, refine layout/colours/gauge styling, repeat until clean
   and SpaceX-minimal. Check: gauges fill correctly at sample values (RPM ±, pitch toward
   −119.5, roll ±30, tank toward 200 kPa), depth shows `m (Pa)`, valve dots track bits,
   gyroscope renders around the model, and the **trend triangles** flip green-▲/red-▼ as a
   feed of changing values streams in (and settle to flat/neutral when steady).
4. **Wiring smoke test** (broker up: `mosquitto -c mosquitto/mosquitto.conf -v`): confirm
   each control still publishes its exact topic/payload (mqtt sub on `nautilus/cmd/#`),
   and that injecting `nautilus/telemetry/*` + `nautilus/status/liveness` messages drives
   the gauges, depth/valves, and liveness panel.
5. Persist a copy of this plan to `nautilus-command-bridge-frontend/docs/frontend_revamp_plan.md`
   during implementation (plan-mode can't write it now).
