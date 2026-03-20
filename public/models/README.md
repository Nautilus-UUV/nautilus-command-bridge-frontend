# UUV Models

This directory holds 3D model files used by the **3D Attitude Viewer** in the Telemetry tab.

Files placed here are served at runtime from the root URL, e.g.
`/models/my_vehicle.glb` → `http://localhost:3000/models/my_vehicle.glb`

## Supported format

**glTF 2.0 binary (`.glb`)** — recommended.
Plain `.gltf` + separate texture/bin files are also supported but require all referenced files to be present in this directory.

## Orientation convention

The loader applies no automatic axis remapping. Author or export your model so that:

- **+X** points toward the vehicle nose (forward)
- **+Y** points up (dorsal)
- **+Z** points to starboard

This matches the axis convention used by the built-in procedural model.

## Registering a new model

See the **Adding a custom UUV model** section of `docs/user_guide.md`.
