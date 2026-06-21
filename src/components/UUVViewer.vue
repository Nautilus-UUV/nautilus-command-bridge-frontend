<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useTheme } from '@/composables/useTheme'

// Central stage element: the UUV model suspended inside a gyroscope cage --
// three orthogonal gimbal rings + a faint wireframe shell.
//
// Two view modes (viewMode prop):
//   'freelook' -- the model sits level (identity) and drag orbits the camera
//                 freely, exactly as the stage behaved before. Inspect the cage
//                 from any angle; nothing tracks telemetry.
//   'locked'   -- the model is tilted to the estimator's inferred roll/pitch
//                 (qw/qx/qy/qz, the /position/estimation quaternion, yaw=0).
//                 Drag is constrained to azimuth so the operator can still spin
//                 the *view* in yaw -- which the glider can't observe -- while
//                 roll and pitch stay pinned to the estimate.
const props = withDefaults(
  defineProps<{
    viewMode?: 'freelook' | 'locked'
    // Estimator attitude quaternion (NED body frame, x/y/z/w). Applied to the
    // model only in 'locked' mode; ignored (model stays level) in 'freelook'.
    qw?: number
    qx?: number
    qy?: number
    qz?: number
    // Live translational acceleration in the IMU's NED body frame (m/s^2):
    // ax forward, ay right, az down. Drawn as a vector arrow from the cage centre,
    // length scaled by magnitude and clamped to the sphere. Defaults to zero
    // (no arrow) so the viewer still works without an IMU feed.
    ax?: number
    ay?: number
    az?: number
  }>(),
  { viewMode: 'freelook', qw: 1, qx: 0, qy: 0, qz: 0, ax: 0, ay: 0, az: 0 },
)

// The scene is Y-up (x fwd, y up, z right); the estimator quaternion and the
// accel vector are both in the NED body frame (x fwd, y right, z down). The
// basis change between them is a single +90 deg rotation about scene X --
// Q_NED_TO_SCENE, the one definition of the frame change (NED y-right -> scene
// z-right, NED z-down -> scene -y). A NED *vector* maps straight through it; a
// NED *attitude* is re-expressed by conjugation, q_scene = Qc * q_ned * Qc^-1,
// where Q_SCENE_TO_NED is the (constant) inverse. Shared by the model and the
// arrow so both ride the same tilt.
const Q_NED_TO_SCENE = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  Math.PI / 2,
)
const Q_SCENE_TO_NED = Q_NED_TO_SCENE.clone().invert()

const { isDark } = useTheme()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── Three.js state (not reactive) ──────────────────────────────────────
let renderer:  THREE.WebGLRenderer
let scene:     THREE.Scene
let camera:    THREE.PerspectiveCamera
let controls:  OrbitControls
let uuvMesh:   THREE.Object3D
let gyroGroup: THREE.Group
let gyroRadius = 0   // bounding-sphere radius of the cage; drives camera framing
let ambLight:  THREE.AmbientLight
let dirLight1: THREE.DirectionalLight
let dirLight2: THREE.DirectionalLight
let animId:    number
let ro:        ResizeObserver

// ── Acceleration arrow (translational accel vector) ───────────────────────
let accelArrow:  THREE.Group            // root, rotated to point along the vector
let accelShaft:  THREE.Mesh             // unit cylinder, scaled in Y to set length
let accelHead:   THREE.Mesh             // cone tip, constant size
let accelMat:    THREE.MeshStandardMaterial
let arrowHeadLen = 0                     // world height of the cone at full size
// Smoothed render state so the 10 Hz feed glides instead of stepping.
const ARROW_UP = new THREE.Vector3(0, 1, 0)   // arrow's local axis before rotation
const arrowDir = new THREE.Vector3(0, 1, 0)   // current (smoothed) target direction
const arrowQuat = new THREE.Quaternion()      // current (smoothed) orientation
let arrowLen = 0                              // current (smoothed) length

// The camera distance is NOT fixed -- it's recomputed per canvas aspect in
// frameGyro() so the whole gyro sphere stays framed even when the stage canvas
// turns portrait on a narrow window (a fixed distance clipped the sphere
// left/right). DEFAULT_DIST only seeds the initial view *direction*; its
// magnitude is overwritten on the first resize. FIT_MARGIN > 1 leaves a clear
// gap between the sphere and the canvas edges. BOTTOM_MARGIN_FRAC is how far
// (in sphere radii) the cage floats off the lower edge once frameGyro pushes it
// down to hug the init bar on a portrait canvas.
const DEFAULT_DIST       = 14
const FIT_MARGIN         = 1.08
const BOTTOM_MARGIN_FRAC = 0.16

// Acceleration arrow tuning. ACCEL_REF_MPS2 is the magnitude that maps to a
// (near) full-radius arrow: ~2 g, so gravity alone (1 g, at rest) draws a clean
// half-radius vector pointing up and maneuvers push it out toward the shell.
// ARROW_FILL keeps the tip just inside the sphere; ARROW_SMOOTH is the per-frame
// lerp toward the latest sample.
const ACCEL_REF_MPS2 = 2 * 9.806
const ARROW_FILL     = 0.9
const ARROW_SMOOTH   = 0.18
const ARROW_MIN_MPS2 = 0.05   // below this the arrow hides (no meaningful direction)

// ── Color helpers ────────────────────────────────────────────────────────
const C = {
  // No scene background: the renderer is alpha:true and the scene clears
  // transparent, so the canvas shows the page straight through. That lets the
  // dark theme's dim center glow (--bg-glow on .v-main) read as emanating from
  // BEHIND the cage, and keeps the canvas blended into the stage in both themes
  // without having to track --bg by hand.
  ambient:  () => isDark.value ? 0x303640 : 0x909099,
  dirLight: () => isDark.value ? 0xbfd0e0 : 0xffffff,
  // Gimbal-ring color. Cyan glows on the near-black dark background, but that
  // same cyan all but vanished on the light gray stage -- so the light theme
  // gets a deep teal that actually reads against #eaeaec.
  ring:     () => isDark.value ? 0x35c9e0 : 0x0e7c8b,
  // Acceleration arrow -- the purple of the TRANS ACC panel title, so the dials
  // and the vector read as the same instrument.
  accel:    () => isDark.value ? 0xb0a2ee : 0x7a55c8,
}

async function buildScene() {
  scene = new THREE.Scene()
  // Transparent — the page (and its center glow) shows through. See C above.
  scene.background = null

  // Camera
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200)
  camera.position.set(
    DEFAULT_DIST * 0.56,
    DEFAULT_DIST * 0.34,
    DEFAULT_DIST * 0.56,
  )
  camera.lookAt(0, 0, 0)

  // Lights
  ambLight = new THREE.AmbientLight(C.ambient(), 1.1)
  scene.add(ambLight)
  dirLight1 = new THREE.DirectionalLight(C.dirLight(), 1.6)
  dirLight1.position.set(5, 8, 5)
  scene.add(dirLight1)
  dirLight2 = new THREE.DirectionalLight(C.dirLight(), 0.4)
  dirLight2.position.set(-4, -2, -4)
  scene.add(dirLight2)

  // UUV model
  const loader = new STLLoader()
  const geometry = await loader.loadAsync('/models/uuv.stl').catch((err) => { console.error('Failed to load uuv.stl:', err); throw err })
  // STL ships with length axis vertical — lay it flat so the nose points along
  // +X with the dorsal side (rudder) facing +Y (scene up). The -pi/2 roll about
  // X is the right-side-up rest pose; the NED z-down convention is carried by the
  // Q_NED_TO_SCENE conjugation in updateSceneAttitude, NOT by this rest pose, so
  // baking it in here too would double-correct and render the model belly-up.
  geometry.rotateZ(-Math.PI / 2)
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({
    color: 0xc2d0de,
    metalness: 0.3,
    roughness: 0.5,
    flatShading: true,
  })
  uuvMesh = new THREE.Mesh(geometry, material)

  // Auto-center and scale to fit the original ellipsoid's ~5 unit length
  const box = new THREE.Box3().setFromObject(uuvMesh)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const scale = 5.0 / maxDim
  uuvMesh.scale.setScalar(scale)
  uuvMesh.position.sub(center.multiplyScalar(scale))
  scene.add(uuvMesh)

  // Gyroscope cage sized to the scaled model's bounding sphere
  const bs = new THREE.Box3().setFromObject(uuvMesh).getBoundingSphere(new THREE.Sphere())
  buildGyro(bs.radius * 1.12)
  buildAccelArrow()
}

// A slim vector arrow rooted at the cage centre: a thin cylinder shaft capped by
// a cone. Built once at unit proportions (shaft is a 1-unit cylinder we scale in
// Y; cone is a fixed size), then each frame updateAccelArrow() rotates the whole
// group to the vector direction and sets the shaft length.
function buildAccelArrow() {
  arrowHeadLen = gyroRadius * 0.14
  const shaftR = gyroRadius * 0.014
  const headR  = gyroRadius * 0.045
  accelMat = new THREE.MeshStandardMaterial({
    color: C.accel(),
    metalness: 0.15,
    roughness: 0.45,
    transparent: true,
    opacity: 0.96,
  })

  accelArrow = new THREE.Group()
  // Cylinder is centred on its own origin (spans y=-0.5..0.5 at unit height); we
  // scale + lift it in updateAccelArrow so its base stays at the cage centre.
  accelShaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, 1, 16), accelMat)
  accelHead = new THREE.Mesh(new THREE.ConeGeometry(headR, arrowHeadLen, 20), accelMat)
  accelArrow.add(accelShaft)
  accelArrow.add(accelHead)
  accelArrow.visible = false
  scene.add(accelArrow)
}

// Three orthogonal gimbal rings (nested radii) + a faint wireframe shell.
function buildGyro(radius: number) {
  gyroRadius = radius   // shell + outermost ring both sit at this radius
  gyroGroup = new THREE.Group()

  // Faint wireframe shell
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 30, 18),
    new THREE.MeshBasicMaterial({ color: C.ring(), wireframe: true, transparent: true, opacity: 0.05 }),
  )
  gyroGroup.add(shell)

  // Gimbal rings: each a great circle about a different axis
  const radii = [radius, radius * 0.93, radius * 0.86]
  const rots: [number, number, number][] = [
    [0, 0, 0],            // around Z
    [Math.PI / 2, 0, 0],  // around Y
    [0, Math.PI / 2, 0],  // around X
  ]
  const opac = [0.6, 0.42, 0.52]
  radii.forEach((rr, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(rr, Math.max(0.012, rr * 0.006), 10, 160),
      new THREE.MeshBasicMaterial({ color: C.ring(), transparent: true, opacity: opac[i] }),
    )
    ring.rotation.set(rots[i][0], rots[i][1], rots[i][2])
    gyroGroup.add(ring)
  })

  scene.add(gyroGroup)
}

function buildControls() {
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping   = true
  controls.dampingFactor   = 0.08
  controls.enablePan       = false
  controls.enableZoom      = false   // distance is driven by fitCameraDistance()
  // Permissive clamp so OrbitControls.update() never overrides the fit distance
  // (it re-derives the orbit radius from camera.position each frame).
  controls.minDistance     = 1
  controls.maxDistance     = 1000
  controls.rotateSpeed     = 0.55
  controls.update()
}

// The model's orientation in scene coords, cached so it's recomputed only when
// the attitude or view mode changes (see watches) -- not per frame. In 'locked'
// mode this is the estimator's NED attitude conjugated into the scene frame; in
// 'freelook' (or with a degenerate quaternion) it's identity, so the model
// stays level. The accel arrow reads the same cache so it rides the tilt.
const sceneQuat = new THREE.Quaternion()

function updateSceneAttitude() {
  const q = new THREE.Quaternion(props.qx, props.qy, props.qz, props.qw)
  if (props.viewMode !== 'locked' || q.lengthSq() < 0.001) sceneQuat.identity()
  else sceneQuat.copy(Q_NED_TO_SCENE).multiply(q.normalize()).multiply(Q_SCENE_TO_NED)
  if (uuvMesh) uuvMesh.setRotationFromQuaternion(sceneQuat)
}

// Constrain orbit by view mode: free in 'freelook'; azimuth-only in 'locked'
// (lock the polar angle to the current elevation so drag spins the view in yaw
// but can't change pitch/roll of the camera).
function applyViewMode() {
  if (!controls) return
  if (props.viewMode === 'locked') {
    const polar = controls.getPolarAngle()
    controls.minPolarAngle = polar
    controls.maxPolarAngle = polar
  } else {
    controls.minPolarAngle = 0
    controls.maxPolarAngle = Math.PI
  }
  controls.update()
}

// Drive the acceleration arrow from the live NED body vector. Maps the body
// frame (x fwd, y right, z down) into the scene's axes (x fwd, y up, z right),
// rides the model's attitude quaternion so it tracks the cage when wired live,
// scales length by magnitude (clamped to the sphere), and lerps both direction
// and length toward the latest sample so the 10 Hz stream glides.
function updateAccelArrow() {
  if (!accelArrow || !gyroRadius) return
  const mag = Math.hypot(props.ax, props.ay, props.az)
  const fullLen = gyroRadius * ARROW_FILL
  const targetLen =
    mag <= ARROW_MIN_MPS2 ? 0 : Math.min((mag / ACCEL_REF_MPS2) * fullLen, fullLen)

  if (mag > ARROW_MIN_MPS2) {
    // NED body -> scene basis (Q_NED_TO_SCENE), then the model's cached attitude
    // so the arrow rides the tilt (identity in freelook, the estimate in locked).
    arrowDir.set(props.ax, props.ay, props.az).normalize()
    arrowDir.applyQuaternion(Q_NED_TO_SCENE).applyQuaternion(sceneQuat)
    arrowQuat.slerp(new THREE.Quaternion().setFromUnitVectors(ARROW_UP, arrowDir), ARROW_SMOOTH)
  }

  arrowLen += (targetLen - arrowLen) * ARROW_SMOOTH
  accelArrow.visible = arrowLen > 0.02
  if (!accelArrow.visible) return

  accelArrow.quaternion.copy(arrowQuat)
  // Keep the cone a constant size until the arrow gets shorter than the head,
  // then let the head shrink with it so a tiny vector still looks like an arrow.
  const headLen = Math.min(arrowHeadLen, arrowLen)
  const shaftLen = Math.max(1e-4, arrowLen - headLen)
  accelShaft.scale.y = shaftLen
  accelShaft.position.y = shaftLen / 2
  accelHead.scale.y = headLen / arrowHeadLen
  accelHead.position.y = shaftLen + headLen / 2
}

function updateColors() {
  if (!scene) return
  ambLight.color.set(C.ambient())
  dirLight1.color.set(C.dirLight())
  dirLight2.color.set(C.dirLight())
  // Recolor the gimbal cage (shell + rings) so the theme toggle swaps the
  // light-theme teal and dark-theme cyan live, not just on first build.
  if (gyroGroup) {
    const c = C.ring()
    gyroGroup.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined
      if (m && 'color' in m) m.color.set(c)
    })
  }
  if (accelMat) accelMat.color.set(C.accel())
}

// Frame the gyro's bounding sphere to (nearly) fill the canvas within BOTH the
// vertical and horizontal FOV -- for a portrait canvas the horizontal FOV is the
// tighter one, so it binds; for landscape, the vertical does. Then push the cage
// DOWN into whatever vertical slack remains so it sits low, hugging the init bar,
// instead of floating at the canvas mid-height. On a portrait canvas the sphere
// is width-fit, leaving tall vertical room that this pan consumes; on a near-
// square / landscape canvas it already fills the height, so there's no slack and
// no pan. The pan moves the camera AND the orbit target together, so it's a pure
// vertical lens-shift -- the fit is undisturbed and dragging still orbits.
function frameGyro() {
  if (!gyroRadius || !camera || !controls) return
  const vFov = (camera.fov * Math.PI) / 180
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  const dist = (gyroRadius / Math.sin(Math.min(vFov, hFov) / 2)) * FIT_MARGIN

  // Preserve the current orbit direction (so a user drag survives a resize);
  // fall back to the seeded oblique view on the very first frame.
  const dir = camera.position.clone().sub(controls.target)
  if (dir.lengthSq() < 1e-6) dir.set(0.56, 0.34, 0.56)
  dir.normalize()
  camera.position.copy(dir).multiplyScalar(dist)
  controls.target.set(0, 0, 0)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()

  // Vertical room above+below the sphere at its own plane; spend it pushing the
  // cage down to BOTTOM_MARGIN_FRAC of a radius off the lower edge.
  const halfH = dist * Math.tan(vFov / 2)
  const panUp = halfH - gyroRadius * (1 + BOTTOM_MARGIN_FRAC)
  if (panUp > 0) {
    // Camera's screen-up axis (2nd column of its world matrix). Panning the view
    // UP slides the scene content DOWN, dropping the cage toward the lower edge.
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    camera.position.addScaledVector(up, panUp)
    controls.target.addScaledVector(up, panUp)
    camera.lookAt(controls.target)
  }
  camera.updateProjectionMatrix()
}

function resize() {
  if (!canvasRef.value || !renderer) return
  const el = canvasRef.value.parentElement!
  const w = el.clientWidth
  const h = el.clientHeight
  if (!w || !h) return
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  frameGyro()
}

function animate() {
  animId = requestAnimationFrame(animate)
  controls.update()          // needed for damping
  updateAccelArrow()         // reads the cached sceneQuat; attitude is set on change
  renderer.render(scene, camera)
}

onMounted(async () => {
  if (!canvasRef.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  await buildScene()
  buildControls()
  updateSceneAttitude()      // seed the model attitude from the initial props
  applyViewMode()
  resize()
  animate()
  ro = new ResizeObserver(resize)
  ro.observe(canvasRef.value.parentElement!)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
  ro?.disconnect()
  controls?.dispose()
  renderer?.dispose()
})

watch(isDark, updateColors)
watch(() => [props.qw, props.qx, props.qy, props.qz, props.viewMode], updateSceneAttitude)
watch(() => props.viewMode, applyViewMode)
</script>

<template>
  <div class="uuv-wrap">
    <canvas ref="canvasRef" class="uuv-canvas" />
  </div>
</template>

<style scoped>
.uuv-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: var(--radius-sm);
  user-select: none;
}

.uuv-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}
.uuv-canvas:active { cursor: grabbing; }
</style>
