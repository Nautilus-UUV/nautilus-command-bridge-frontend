---
name: Project Structure
description: Key file paths and responsibilities in the nautilus-command-bridge-frontend
type: project
---

- `src/views/Charts.vue` — Main telemetry dashboard (sensor grid, depth chart, 3D attitude viewer)
- `src/views/Commands.vue` — Command control (quick actions, dive profiles, command history)
- `src/views/Simulations.vue` — Simulation config (stub/WIP)
- `src/components/UUVViewer.vue` — Three.js 3D UUV model with quaternion attitude
- `src/components/CommandPanels/` — Command sub-components (buttons, history, path editor)
- `src/store/datalogs.ts` — Pinia store for all sensor telemetry polling
- `src/store/commands.ts` — Command queue and history
- `src/store/missions.ts` — Server-side dive mission profiles
- `src/store/path.ts` — Client-side path segments (local only)
- `src/router/index.ts` — Routes: / (Charts), /commands, /simulations
- `src/assets/api_requests.ts` — HTTP utility functions
- `src/composables/useTheme.ts` — Theme management
