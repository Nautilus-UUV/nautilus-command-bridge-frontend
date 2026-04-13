---
name: Project Overview
description: Nautilus Command Bridge frontend - UUV control interface tech stack, design, and key context
type: project
---

Vue 3 + TypeScript + Vite + Vuetify 3 + Pinia + Three.js + Chart.js frontend for commanding and monitoring an Unmanned Underwater Vehicle (UUV).

**Key pages:** Telemetry (Charts.vue), Commands, Simulations
**Data flow:** REST polling every 5s from backend at localhost:8000/api
**Sensors:** depth, target depth, hull/tank/ext pressure, pose (position + quaternion), leakage, system alive
**3D viewer:** Three.js with GLTF model, quaternion-based attitude display
**Theme:** Light/dark mode with CSS custom properties

**Why:** This is for ARIS — the UUV project. The UI is used during real underwater tests.
**How to apply:** Design decisions should prioritize operational clarity and safety-critical visibility.
