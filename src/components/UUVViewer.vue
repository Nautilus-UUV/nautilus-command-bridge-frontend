<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useTheme } from '@/composables/useTheme'

// Central stage element: the UUV model suspended inside a gyroscope cage --
// three orthogonal gimbal rings + a faint wireframe shell. Orientation is held
// STATIC for now (identity quaternion default); the qw/qx/qy/qz props are kept
// so wiring the cage to a live IMU attitude later is a one-line change at the
// call site. Drag orbits the camera; the model and cage themselves don't move.
const props = withDefaults(
  defineProps<{
    qw?: number
    qx?: number
    qy?: number
    qz?: number
  }>(),
  { qw: 1, qx: 0, qy: 0, qz: 0 },
)

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
  // STL ships with length axis vertical — lay it flat so nose points along +X
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

function applyQuaternion() {
  if (!uuvMesh) return
  const q = new THREE.Quaternion(props.qx, props.qy, props.qz, props.qw)
  if (q.lengthSq() < 0.001) q.set(0, 0, 0, 1)
  else q.normalize()
  uuvMesh.setRotationFromQuaternion(q)
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
  applyQuaternion()
  renderer.render(scene, camera)
}

onMounted(async () => {
  if (!canvasRef.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  await buildScene()
  buildControls()
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
watch(() => [props.qw, props.qx, props.qy, props.qz], applyQuaternion)
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
