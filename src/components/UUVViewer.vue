<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useTheme } from '@/composables/useTheme'

const props = defineProps<{
  qw: number
  qx: number
  qy: number
  qz: number
  depth: number
}>()

const { isDark } = useTheme()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ── Three.js state (not reactive) ──────────────────────────────────────
let renderer:    THREE.WebGLRenderer
let scene:       THREE.Scene
let camera:      THREE.PerspectiveCamera
let controls:    OrbitControls
let uuvMesh:     THREE.Object3D
let gridHelper:  THREE.GridHelper
let ambLight:    THREE.AmbientLight
let dirLight1:   THREE.DirectionalLight
let dirLight2:   THREE.DirectionalLight
let animId:      number
let ro:          ResizeObserver

// Camera distance config
const DEFAULT_DIST = 7.0
const MIN_DIST     = DEFAULT_DIST / 2   // 2× closer
const MAX_DIST     = DEFAULT_DIST * 2   // 2× farther
const ZOOM_STEP    = 1.2

// ── Euler angles from quaternion ────────────────────────────────────────
const rollDeg = computed(() => {
  const { qw, qx, qy, qz } = props
  const sinr = 2 * (qw * qx + qy * qz)
  const cosr = 1 - 2 * (qx * qx + qy * qy)
  return (Math.atan2(sinr, cosr) * 180 / Math.PI).toFixed(1)
})
const pitchDeg = computed(() => {
  const { qw, qx, qy, qz } = props
  const sinp = 2 * (qw * qy - qz * qx)
  const clamped = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp)
  return (clamped * 180 / Math.PI).toFixed(1)
})
const yawDeg = computed(() => {
  const { qw, qx, qy, qz } = props
  const siny = 2 * (qw * qz + qx * qy)
  const cosy = 1 - 2 * (qy * qy + qz * qz)
  return (Math.atan2(siny, cosy) * 180 / Math.PI).toFixed(1)
})

// ── Color helpers ────────────────────────────────────────────────────────
const C = {
  bg:       () => isDark.value ? 0x0f0f16 : 0xf0f0f4,
  grid:     () => isDark.value ? 0x282840 : 0xccccde,
  ambient:  () => isDark.value ? 0x303050 : 0x909099,
  dirLight: () => isDark.value ? 0xaab8d0 : 0xffffff,
}

async function buildScene() {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(C.bg())

  // Camera
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200)
  camera.position.set(
    DEFAULT_DIST * 0.56,
    DEFAULT_DIST * 0.35,
    DEFAULT_DIST * 0.56
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
    color: 0xb8c4d4,
    metalness: 0.25,
    roughness: 0.55,
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

  // Reference grid (horizontal)
  gridHelper = new THREE.GridHelper(10, 20, C.grid(), C.grid())
  gridHelper.position.y = -2.2
  scene.add(gridHelper)

  // Small axes indicator
  const axes = new THREE.AxesHelper(1.4)
  scene.add(axes)
}

function buildControls() {
  controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping   = true
  controls.dampingFactor   = 0.08
  controls.enablePan       = false
  controls.enableZoom      = false   // handled by buttons
  controls.minDistance     = MIN_DIST
  controls.maxDistance     = MAX_DIST
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
  scene.background = new THREE.Color(C.bg())
  // GridHelper has no setColors() — recreate it
  scene.remove(gridHelper)
  gridHelper = new THREE.GridHelper(10, 20, C.grid(), C.grid())
  gridHelper.position.y = -2.2
  scene.add(gridHelper)
  // Update lights
  ambLight.color.set(C.ambient())
  dirLight1.color.set(C.dirLight())
  dirLight2.color.set(C.dirLight())
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
}

function zoomBy(delta: number) {
  const dir  = camera.position.clone().sub(controls.target).normalize()
  const dist = camera.position.distanceTo(controls.target)
  const next = Math.min(MAX_DIST, Math.max(MIN_DIST, dist + delta))
  camera.position.copy(controls.target).addScaledVector(dir, next)
  controls.update()
}

function zoomIn()  { zoomBy(-ZOOM_STEP) }
function zoomOut() { zoomBy(+ZOOM_STEP) }

function animate() {
  animId = requestAnimationFrame(animate)
  controls.update()          // needed for damping
  applyQuaternion()
  renderer.render(scene, camera)
}

onMounted(async () => {
  if (!canvasRef.value) return
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
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

    <!-- Zoom controls -->
    <div class="zoom-btns">
      <button class="zoom-btn" @click="zoomIn"  title="Zoom in">
        <v-icon size="13">mdi-plus</v-icon>
      </button>
      <button class="zoom-btn" @click="zoomOut" title="Zoom out">
        <v-icon size="13">mdi-minus</v-icon>
      </button>
    </div>

    <!-- HUD overlay -->
    <div class="hud">
      <div class="hud-row"><span class="hk">Roll </span><span class="hv">{{ rollDeg }}°</span></div>
      <div class="hud-row"><span class="hk">Pitch</span><span class="hv">{{ pitchDeg }}°</span></div>
      <div class="hud-row"><span class="hk">Yaw  </span><span class="hv">{{ yawDeg }}°</span></div>
      <div class="hud-row"><span class="hk">Depth</span><span class="hv">{{ depth.toFixed(1) }} m</span></div>
    </div>

    <!-- Drag hint (fades after first interaction) -->
    <div class="drag-hint">drag to orbit</div>
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

/* ── Zoom buttons ──────────────────────────────────────────────────────── */
.zoom-btns {
  position: absolute;
  bottom: 14px;
  right: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn);
  color: var(--text-muted);
  opacity: 0.85;
  transition: background var(--transition), opacity var(--transition), color var(--transition);
  backdrop-filter: blur(4px);
}
.zoom-btn:hover {
  opacity: 1;
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}

/* ── HUD ───────────────────────────────────────────────────────────────── */
.hud {
  position: absolute;
  top: 12px;
  left: 13px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.hud-row { display: flex; align-items: baseline; gap: 5px; }
.hk {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-hint);
  width: 32px;
  flex-shrink: 0;
}
.hv {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-muted);
}

/* ── Drag hint ─────────────────────────────────────────────────────────── */
.drag-hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-ui);
  font-size: 9.5px;
  color: var(--text-hint);
  letter-spacing: 0.06em;
  pointer-events: none;
  opacity: 0.7;
}
</style>
