# NAUTILUS Command Bridge — Documentation Index

NAUTILUS Command Bridge is a Vue 3 + TypeScript frontend for controlling an autonomous underwater vehicle (AUV/UUV). It runs on port 3000 and connects to a REST backend at `http://localhost:8000/api`.

## Documents

### [System Design](./system_design.md)

Comprehensive technical reference for developers and integrators. Covers:

- System overview and architecture diagram
- Full tech stack
- Design principles with rationale
- Theming system (CSS custom properties, dark mode, font scale)
- State management (each Pinia store: ownership, polling strategy, key actions)
- Data flow diagrams
- Complete API contract (all endpoints, request/response shapes, TypeScript types)
- Component hierarchy
- Three.js integration notes
- Build and development setup
- Known limitations and planned improvements

### [API Reference](./api.md)

Complete backend API contract for FastAPI implementors. Covers:

- Base URL and request conventions (POST-only, JSON, credentials)
- All telemetry endpoints (load + load-new pattern for each sensor)
- Command dispatch and history polling
- Mission profile CRUD
- Planned simulation endpoints with expected request shapes
- FastAPI CORS configuration notes

### [User Guide](./user_guide.md)

Practical operator reference. Covers:

- What NAUTILUS Command Bridge does
- Quick start
- Navigation and dark mode toggle
- Telemetry tab — sensor cards, depth chart, 3D attitude viewer, sidebar toggles
- Commands tab — quick actions, dive profile editor, Naive path editor, CSV import/export, command history
- Simulations tab — model selection, parameters, controls, telemetry overlay
- Tips and troubleshooting
