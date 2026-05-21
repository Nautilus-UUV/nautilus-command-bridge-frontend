<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Title, CategoryScale, Tooltip, Filler, Legend
} from 'chart.js'
import { useTelemetryStore } from '@/store/telemetry'
import { storeToRefs } from 'pinia'
import { LineChart } from 'vue-chart-3'
import { DateTime } from 'luxon'
import { useTheme } from '@/composables/useTheme'
import { useUnits, ATMOSPHERIC_PA, PA_PER_M_ABSOLUTE } from '@/composables/useUnits'
import AttitudeIndicator from '@/components/AttitudeIndicator.vue'
import UUVViewer from '@/components/UUVViewer.vue'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Filler, Legend)

const { isDark } = useTheme()
const { pressureUnit, formatPressure, paToDepthM } = useUnits()

const telemStore = useTelemetryStore()
const {
  position, positionTarget,
  imuLeft, imuRight,
  bcuPressure, externalPressure,
  bcuRpm, bcuValves,
  acuPitch, acuRoll,
  missionActive,
} = storeToRefs(telemStore)

// Mission id -> human name. Mirrors the dispatch table in
// CommandProfilePanel.vue; keep in sync if missions are reordered in
// py_pkg/path/missions/factory.py.
const MISSION_NAMES: Record<number, string> = {
  0: 'Trim & Neutral',
  1: 'Sawtooth',
  2: 'Surface',
}

// ── Viz panel visibility ──────────────────────────────────────────────
const showChart   = ref(true)
const showUUV     = ref(true)
const showBcu     = ref(true)
const showAcu     = ref(true)
const attitudeMode = ref<'2d' | '3d'>('2d')

// ── Latest sample shortcuts ───────────────────────────────────────────
const latestPose = computed(() => position.value[0]?.value ?? {
  position: { x: 0, y: 0, z: 0 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
})
const latestDepth = computed(() => latestPose.value.position.z)

const latestExtPa  = computed(() => externalPressure.value[0]?.value ?? null)
const latestTankPa = computed(() => bcuPressure.value[0]?.value ?? null)
const latestRpm    = computed(() => bcuRpm.value[0]?.value ?? null)
const latestValves = computed(() => bcuValves.value[0]?.value ?? null)
const latestPitch  = computed(() => acuPitch.value[0]?.value ?? null)
const latestRoll   = computed(() => acuRoll.value[0]?.value ?? null)

const activeMission = computed(() => missionActive.value[0]?.value ?? null)
const missionTimeline = computed(() => missionActive.value.slice(0, 5))

// Pitch/roll come over the wire as Int16 in the controller's wire units
// (mm for pitch, centidegrees for roll). Convert for the readouts so the
// operator sees something physical.
const pitchMmText = computed(() =>
  latestPitch.value === null ? '—' : `${latestPitch.value} mm`)
const rollDegText = computed(() =>
  latestRoll.value === null ? '—' : `${(latestRoll.value / 100).toFixed(2)}°`)

// Valves bitmap -> two booleans (bit 0 = valve 1, bit 1 = valve 2).
const valve1Open = computed(() => latestValves.value !== null && (latestValves.value & 1) !== 0)
const valve2Open = computed(() => latestValves.value !== null && (latestValves.value & 2) !== 0)

// ── Euler helper ──────────────────────────────────────────────────────
function qToEuler(qw: number, qx: number, qy: number, qz: number) {
  const roll  = Math.atan2(2*(qw*qx + qy*qz), 1 - 2*(qx*qx + qy*qy)) * 180 / Math.PI
  const sinp  = 2*(qw*qy - qz*qx)
  const pitch = (Math.abs(sinp) >= 1 ? Math.sign(sinp)*90 : Math.asin(sinp)*180/Math.PI)
  const yaw   = Math.atan2(2*(qw*qz + qx*qy), 1 - 2*(qy*qy + qz*qz)) * 180 / Math.PI
  return { roll, pitch, yaw }
}

function fmtTs(iso: string) {
  return iso ? DateTime.fromISO(iso, { zone:'system' }).toFormat('HH:mm:ss.SSS') : '—'
}

// ── Data table ────────────────────────────────────────────────────────
interface TableRow {
  sensor: string; value: string; unit: string; time: string
  status?: 'ok' | 'err'
}

// Format a pressure sample through the unit toggle. Falls back to "—" if
// no sample has arrived. Pa readings get integer formatting; depth m
// gets two decimals.
function pressureRow(sensor: string, samples: { recordDatetime: string; value: number }[]): TableRow {
  const s = samples[0]
  if (!s) return { sensor, value: '—', unit: pressureUnit.value, time: '—' }
  const f = formatPressure(s.value)
  return { sensor, value: f.value.toString(), unit: f.unit, time: fmtTs(s.recordDatetime) }
}

const tableRows = computed<TableRow[]>(() => {
  const poseSample = position.value[0]
  const pose = poseSample?.value
  const euler = pose ? qToEuler(pose.orientation.w, pose.orientation.x, pose.orientation.y, pose.orientation.z) : { roll:0, pitch:0, yaw:0 }
  const poseTs = poseSample?.recordDatetime ?? ''

  const imuLeftTs  = imuLeft.value[0]?.recordDatetime ?? ''
  const imuRightTs = imuRight.value[0]?.recordDatetime ?? ''

  return [
    pressureRow('External Pressure', externalPressure.value),
    pressureRow('Tank Pressure', bcuPressure.value),
    { sensor: 'EKF X', value: pose ? pose.position.x.toFixed(3) : '—', unit: 'm', time: fmtTs(poseTs) },
    { sensor: 'EKF Y', value: pose ? pose.position.y.toFixed(3) : '—', unit: 'm', time: fmtTs(poseTs) },
    { sensor: 'EKF Z (depth)', value: pose ? pose.position.z.toFixed(3) : '—', unit: 'm', time: fmtTs(poseTs) },
    { sensor: 'Roll',  value: pose ? euler.roll.toFixed(2)  : '—', unit: '°', time: fmtTs(poseTs) },
    { sensor: 'Pitch', value: pose ? euler.pitch.toFixed(2) : '—', unit: '°', time: fmtTs(poseTs) },
    { sensor: 'Yaw',   value: pose ? euler.yaw.toFixed(2)   : '—', unit: '°', time: fmtTs(poseTs) },
    { sensor: 'Left IMU |a|',  value: imuLeftAccel.value  !== null ? imuLeftAccel.value.toFixed(3)  : '—', unit: 'm/s²',  time: fmtTs(imuLeftTs) },
    { sensor: 'Right IMU |a|', value: imuRightAccel.value !== null ? imuRightAccel.value.toFixed(3) : '—', unit: 'm/s²',  time: fmtTs(imuRightTs) },
    { sensor: 'Left IMU |ω|',  value: imuLeftGyro.value   !== null ? imuLeftGyro.value.toFixed(3)   : '—', unit: 'rad/s', time: fmtTs(imuLeftTs) },
    { sensor: 'Right IMU |ω|', value: imuRightGyro.value  !== null ? imuRightGyro.value.toFixed(3)  : '—', unit: 'rad/s', time: fmtTs(imuRightTs) },
  ]
})

// ── Depth chart (pressure-derived depth over time) ────────────────────
// Source is the raw external pressure sensor, not the EKF. Unit
// conversion goes through useUnits() so this strip chart tracks the
// AppBar Pa/m toggle in lockstep with the numeric readouts. EKF Z
// stays in the main table for comparison.
//
// Values stay positive (deeper = bigger number) and the Y axis is
// rendered reversed so larger values plot lower on the chart -- so
// "down" still maps to "below" visually while the readouts keep the
// +down convention operators expect:
//   m  mode -> displayed = depth_m           (surface 0, dive +10)
//   Pa mode -> displayed = p_abs - ATM       (surface 0, dive +98100)
// Both modes are linearly related by PA_PER_M_ABSOLUTE, so manual
// bounds convert cleanly without an atmospheric offset.
const newestExternalPressure = computed(() => externalPressure.value.slice(0, 60).reverse())
const depthValues = computed<number[]>(() => {
  if (pressureUnit.value === 'm') {
    return newestExternalPressure.value.map(p => Math.round(paToDepthM(p.value) * 100) / 100)
  }
  return newestExternalPressure.value.map(p => Math.round(p.value - ATMOSPHERIC_PA))
})
const depthLabels = computed<string[]>(() =>
  newestExternalPressure.value.map(p => DateTime.fromISO(p.recordDatetime, { zone:'system' }).toFormat('HH:mm:ss')))

const depthSeriesLabel = computed(() =>
  pressureUnit.value === 'm' ? 'Depth (m, +down)' : 'Gauge (Pa, atm=0, +down)')
const depthAxisTitle = computed(() =>
  pressureUnit.value === 'm' ? 'Depth (m, +down)' : 'Gauge pressure (Pa, atm=0, +down)')

// Manual Y-axis bounds. `null` means auto-scale (Chart.js treats an
// undefined `min`/`max` the same way). In the signed display the two
// modes are scalar multiples (m * PA_PER_M_ABSOLUTE = Pa), so bounds
// convert by a single factor and min/max keep their roles across the
// toggle.
//
// Defaults are stated in meters (surface to a typical dive depth). If
// the operator's persisted pressureUnit is Pa at boot, the m-defined
// defaults are converted into gauge Pa so the chart shows the same
// physical window in either unit. Page reload always reapplies these
// defaults -- nothing about the bounds is persisted between sessions.
const DEPTH_DEFAULT_MIN_M = 0
const DEPTH_DEFAULT_MAX_M = 20
const initialYMin = pressureUnit.value === 'm'
  ? DEPTH_DEFAULT_MIN_M
  : Math.round(DEPTH_DEFAULT_MIN_M * PA_PER_M_ABSOLUTE)
const initialYMax = pressureUnit.value === 'm'
  ? DEPTH_DEFAULT_MAX_M
  : Math.round(DEPTH_DEFAULT_MAX_M * PA_PER_M_ABSOLUTE)
const yMin = ref<number | null>(initialYMin)
const yMax = ref<number | null>(initialYMax)

watch(pressureUnit, (newUnit, oldUnit) => {
  if (newUnit === oldUnit) return
  const convert = (v: number | null): number | null => {
    if (v === null) return null
    if (newUnit === 'Pa') return Math.round(v * PA_PER_M_ABSOLUTE)
    return Math.round((v / PA_PER_M_ABSOLUTE) * 100) / 100
  }
  yMin.value = convert(yMin.value)
  yMax.value = convert(yMax.value)
})

function resetYBounds() {
  yMin.value = null
  yMax.value = null
}

const chartData = computed(() => ({
  labels: depthLabels.value,
  datasets: [
    {
      label: depthSeriesLabel.value,
      data: depthValues.value,
      borderColor: isDark.value ? '#6090d8' : '#4a7fcb',
      backgroundColor: isDark.value ? 'rgba(96,144,216,0.07)' : 'rgba(74,127,203,0.07)',
      fill: true, tension: 0, stepped: 'before' as const, pointRadius: 1,
      pointBackgroundColor: isDark.value ? '#6090d8' : '#4a7fcb',
      borderWidth: 1.5,
    },
  ],
}))

const chartOptions = computed(() => ({
  scales: {
    x: {
      ticks: { font:{family:'Inter, sans-serif',size:10}, color: isDark.value ? '#606080' : '#808090', maxRotation:30, maxTicksLimit: 6 },
      grid:  { color: isDark.value ? '#21212e' : '#e8e8ee' },
    },
    y: {
      reverse: true,
      ticks: { font:{family:'Inter, sans-serif',size:10}, color: isDark.value ? '#606080' : '#808090' },
      grid:  { color: isDark.value ? '#21212e' : '#e8e8ee' },
      title: { display:true, text: depthAxisTitle.value, font:{family:'Inter, sans-serif',size:10}, color: isDark.value ? '#505060' : '#909090' },
      min: yMin.value ?? undefined,
      max: yMax.value ?? undefined,
    }
  },
  plugins: {
    legend: { display: false },
    tooltip: { titleFont:{family:'Inter, sans-serif',size:11}, bodyFont:{family:'Inter, sans-serif',size:11} }
  },
  responsive: true,
  maintainAspectRatio: false,
  animation: false as const,
}))

// ── BCU strip chart (rpm over time) ───────────────────────────────────
const newestRpm = computed(() => bcuRpm.value.slice(0, 60).reverse())
const bcuChartData = computed(() => ({
  labels: newestRpm.value.map(p => DateTime.fromISO(p.recordDatetime, { zone:'system' }).toFormat('HH:mm:ss')),
  datasets: [{
    label: 'BCU RPM',
    data: newestRpm.value.map(p => p.value),
    borderColor: isDark.value ? '#d09040' : '#c07818',
    backgroundColor: 'transparent',
    fill: false, tension: 0, stepped: 'before' as const, pointRadius: 1, borderWidth: 1.5,
  }],
}))

// Manual Y bounds for the BCU RPM strip chart. Default range covers
// the controller's full forward/reverse pump envelope so single-axis
// spikes stay visible without the chart auto-scaling around them.
const bcuYMin = ref<number | null>(-4200)
const bcuYMax = ref<number | null>(4200)

const bcuChartOptions = computed(() => ({
  scales: {
    x: { ticks: { color: isDark.value ? '#606080' : '#808090', maxRotation: 30, maxTicksLimit: 6, font: { size: 10 } } },
    y: {
      ticks: { color: isDark.value ? '#606080' : '#808090', font: { size: 10 } },
      min: bcuYMin.value ?? undefined,
      max: bcuYMax.value ?? undefined,
    },
  },
  plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
  responsive: true, maintainAspectRatio: false,
  animation: false as const,
}))

// ── ACU strip chart (pitch mm + roll deg) ─────────────────────────────
const newestPitch = computed(() => acuPitch.value.slice(0, 60).reverse())
const newestRoll  = computed(() => acuRoll.value.slice(0, 60).reverse())
const acuChartData = computed(() => ({
  labels: newestPitch.value.map(p => DateTime.fromISO(p.recordDatetime, { zone:'system' }).toFormat('HH:mm:ss')),
  datasets: [
    {
      label: 'Pitch (mm)',
      data: newestPitch.value.map(p => p.value),
      borderColor: isDark.value ? '#60c090' : '#3a8c60',
      yAxisID: 'y',
      backgroundColor: 'transparent',
      fill: false, tension: 0, stepped: 'before' as const, pointRadius: 1, borderWidth: 1.5,
    },
    {
      label: 'Roll (°)',
      data: newestRoll.value.map(p => p.value / 100),
      borderColor: isDark.value ? '#c060c0' : '#8c3a8c',
      yAxisID: 'y1',
      backgroundColor: 'transparent',
      fill: false, tension: 0, stepped: 'before' as const, pointRadius: 1, borderWidth: 1.5,
      borderDash: [4, 3],
    },
  ],
}))

// Manual Y bounds for the ACU strip chart. The chart has two axes
// (pitch mm on y, roll deg on y1); we only expose controls for the
// primary pitch axis to keep the panel header from overflowing.
// Default pitch window spans the trim sled's negative-mm bias range
// so the operator sees the full physical travel without zoom drift.
const acuYMin = ref<number | null>(-120)
const acuYMax = ref<number | null>(0)

const acuChartOptions = computed(() => ({
  scales: {
    x: { ticks: { color: isDark.value ? '#606080' : '#808090', maxRotation: 30, maxTicksLimit: 6, font: { size: 10 } } },
    y: {
      position: 'left',
      title: { display: true, text: 'Pitch (mm)' },
      ticks: { color: isDark.value ? '#606080' : '#808090' },
      min: acuYMin.value ?? undefined,
      max: acuYMax.value ?? undefined,
    },
    y1: { position: 'right', title: { display: true, text: 'Roll (°)'   }, grid: { drawOnChartArea: false } },
  },
  plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
  responsive: true, maintainAspectRatio: false,
  animation: false as const,
}))

// ── IMU per-axis (latest sample) + magnitudes ─────────────────────────
// Per-axis values get their own table so a single tilted-bias or
// runaway-axis fault is visible at a glance. Magnitudes (|a|, |ω|)
// also get folded into the main "All Current Values" table so the
// at-a-glance card always carries IMU presence.
function vecMag(v?: { x: number; y: number; z: number }): number | null {
  if (!v) return null
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}
const imuLeftAccel  = computed(() => vecMag(imuLeft.value[0]?.value.linear_acceleration))
const imuRightAccel = computed(() => vecMag(imuRight.value[0]?.value.linear_acceleration))
const imuLeftGyro   = computed(() => vecMag(imuLeft.value[0]?.value.angular_velocity))
const imuRightGyro  = computed(() => vecMag(imuRight.value[0]?.value.angular_velocity))

const imuLeftAccelVec  = computed(() => imuLeft.value[0]?.value.linear_acceleration ?? null)
const imuRightAccelVec = computed(() => imuRight.value[0]?.value.linear_acceleration ?? null)
const imuLeftGyroVec   = computed(() => imuLeft.value[0]?.value.angular_velocity ?? null)
const imuRightGyroVec  = computed(() => imuRight.value[0]?.value.angular_velocity ?? null)

function fmtAxis(v: { x: number; y: number; z: number } | null, axis: 'x' | 'y' | 'z'): string {
  return v === null ? '—' : v[axis].toFixed(3)
}
</script>

<template>
  <div class="telem-root">
    <div class="telem-main">

      <!-- Viz row: depth chart + attitude -->
      <div v-if="showChart || showUUV" class="viz-row">

        <div v-if="showChart" class="viz-panel">
          <div class="panel-title">
            Depth over Time
            <div class="y-axis-ctl">
              <span class="y-axis-lbl">Y</span>
              <input
                type="number"
                v-model.number="yMin"
                placeholder="min"
                :title="`Y-axis min (${pressureUnit}). Leave empty for auto.`"
              />
              <input
                type="number"
                v-model.number="yMax"
                placeholder="max"
                :title="`Y-axis max (${pressureUnit}). Leave empty for auto.`"
              />
              <button class="vt-btn" @click="resetYBounds" title="Clear bounds, return to auto-scale">auto</button>
            </div>
          </div>
          <div class="viz-body">
            <LineChart :chartData="chartData" :options="chartOptions" style="width:100%;height:100%" />
          </div>
        </div>

        <div v-if="showUUV" class="viz-panel">
          <div class="panel-title">
            Attitude (EKF)
            <div class="view-toggle">
              <button class="vt-btn" :class="{ active: attitudeMode === '2d' }" @click="attitudeMode = '2d'">2D</button>
              <button class="vt-btn" :class="{ active: attitudeMode === '3d' }" @click="attitudeMode = '3d'">3D</button>
            </div>
          </div>
          <div class="viz-body">
            <AttitudeIndicator
              v-if="attitudeMode === '2d'"
              :qw="latestPose.orientation.w" :qx="latestPose.orientation.x"
              :qy="latestPose.orientation.y" :qz="latestPose.orientation.z"
              :depth="latestDepth"
            />
            <UUVViewer
              v-else
              :qw="latestPose.orientation.w" :qx="latestPose.orientation.x"
              :qy="latestPose.orientation.y" :qz="latestPose.orientation.z"
              :depth="latestDepth"
            />
          </div>
        </div>

      </div>

      <!-- Active Mission + BCU + ACU -->
      <div class="cmd-row">
        <div class="cmd-panel">
          <div class="panel-title">Active Mission</div>
          <div v-if="!activeMission" class="dim small">No mission published yet.</div>
          <div v-else class="kv-grid">
            <div class="kv-key">Mission</div>
            <div class="kv-val">
              {{ activeMission.mission_id !== null ? (MISSION_NAMES[activeMission.mission_id] ?? `id ${activeMission.mission_id}`) : '—' }}
            </div>
            <div class="kv-key">State</div>
            <div class="kv-val">
              <span class="state-badge" :class="`state-${activeMission.state.toLowerCase()}`">{{ activeMission.state }}</span>
            </div>
            <template v-if="activeMission.target_pressure_pa !== undefined">
              <div class="kv-key">Target depth</div>
              <div class="kv-val mono">
                <template v-if="pressureUnit === 'm'">
                  {{ (activeMission.target_pressure_pa / 9810).toFixed(2) }} m
                </template>
                <template v-else>
                  {{ Math.round(activeMission.target_pressure_pa) }} Pa
                </template>
              </div>
            </template>
            <template v-if="activeMission.angle_rad !== undefined && activeMission.angle_rad !== 0">
              <div class="kv-key">Pitch angle</div>
              <div class="kv-val mono">{{ (activeMission.angle_rad * 180 / Math.PI).toFixed(1) }}°</div>
            </template>
            <template v-if="activeMission.n_resurfaces !== undefined && activeMission.n_resurfaces !== 0">
              <div class="kv-key">Resurfaces</div>
              <div class="kv-val mono">{{ activeMission.n_resurfaces }}</div>
            </template>
          </div>
          <div v-if="missionTimeline.length > 1" class="timeline">
            <div class="timeline-label">Recent dispatches</div>
            <div v-for="(m, i) in missionTimeline" :key="i" class="timeline-row">
              <span class="mono dim">{{ fmtTs(m.recordDatetime) }}</span>
              <span>{{ m.value.mission_id !== null ? (MISSION_NAMES[m.value.mission_id] ?? `id ${m.value.mission_id}`) : '—' }}</span>
              <span class="state-badge" :class="`state-${m.value.state.toLowerCase()}`">{{ m.value.state }}</span>
            </div>
          </div>
        </div>

        <div v-if="showBcu" class="cmd-panel">
          <div class="panel-title">
            BCU Commands
            <div class="y-axis-ctl">
              <span class="y-axis-lbl">Y</span>
              <input type="number" v-model.number="bcuYMin" placeholder="min" title="RPM Y-axis min. Leave empty for auto." />
              <input type="number" v-model.number="bcuYMax" placeholder="max" title="RPM Y-axis max. Leave empty for auto." />
              <button class="vt-btn" @click="bcuYMin = null; bcuYMax = null" title="Clear bounds, return to auto-scale">auto</button>
            </div>
          </div>
          <div class="kv-grid">
            <div class="kv-key">RPM</div>
            <div class="kv-val mono">{{ latestRpm ?? '—' }}</div>
            <div class="kv-key">Valves</div>
            <div class="kv-val">
              <span class="valve-led" :class="{ on: valve1Open }" title="Valve 1">V1</span>
              <span class="valve-led" :class="{ on: valve2Open }" title="Valve 2">V2</span>
            </div>
          </div>
          <div class="strip-body">
            <LineChart :chartData="bcuChartData" :options="bcuChartOptions" style="width:100%;height:100%" />
          </div>
        </div>

        <div v-if="showAcu" class="cmd-panel">
          <div class="panel-title">
            ACU Commands
            <div class="y-axis-ctl">
              <span class="y-axis-lbl">Y</span>
              <input type="number" v-model.number="acuYMin" placeholder="min" title="Pitch Y-axis min (mm). Leave empty for auto." />
              <input type="number" v-model.number="acuYMax" placeholder="max" title="Pitch Y-axis max (mm). Leave empty for auto." />
              <button class="vt-btn" @click="acuYMin = null; acuYMax = null" title="Clear bounds, return to auto-scale">auto</button>
            </div>
          </div>
          <div class="kv-grid">
            <div class="kv-key">Pitch</div>
            <div class="kv-val mono">{{ pitchMmText }}</div>
            <div class="kv-key">Roll</div>
            <div class="kv-val mono">{{ rollDegText }}</div>
          </div>
          <div class="strip-body">
            <LineChart :chartData="acuChartData" :options="acuChartOptions" style="width:100%;height:100%" />
          </div>
        </div>
      </div>

      <!-- Data table + IMU summary -->
      <div class="bottom-row">

        <div class="table-panel">
          <div class="panel-title">All Current Values</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>Sensor</th><th class="r">Value</th><th>Unit</th><th>Last Updated</th></tr>
              </thead>
              <tbody>
                <tr v-for="row in tableRows" :key="row.sensor">
                  <td>{{ row.sensor }}</td>
                  <td class="r mono">{{ row.value }}</td>
                  <td class="dim">{{ row.unit }}</td>
                  <td class="mono dim">{{ row.time }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="table-panel imu-panel">
          <div class="panel-title">IMU Per-Axis (m/s², rad/s)</div>
          <table class="data-table imu-axis-table">
            <thead>
              <tr>
                <th>Sensor</th>
                <th class="r">a.x</th><th class="r">a.y</th><th class="r">a.z</th>
                <th class="r sep">ω.x</th><th class="r">ω.y</th><th class="r">ω.z</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Left IMU</td>
                <td class="r mono">{{ fmtAxis(imuLeftAccelVec, 'x') }}</td>
                <td class="r mono">{{ fmtAxis(imuLeftAccelVec, 'y') }}</td>
                <td class="r mono">{{ fmtAxis(imuLeftAccelVec, 'z') }}</td>
                <td class="r mono sep">{{ fmtAxis(imuLeftGyroVec, 'x') }}</td>
                <td class="r mono">{{ fmtAxis(imuLeftGyroVec, 'y') }}</td>
                <td class="r mono">{{ fmtAxis(imuLeftGyroVec, 'z') }}</td>
              </tr>
              <tr>
                <td>Right IMU</td>
                <td class="r mono">{{ fmtAxis(imuRightAccelVec, 'x') }}</td>
                <td class="r mono">{{ fmtAxis(imuRightAccelVec, 'y') }}</td>
                <td class="r mono">{{ fmtAxis(imuRightAccelVec, 'z') }}</td>
                <td class="r mono sep">{{ fmtAxis(imuRightGyroVec, 'x') }}</td>
                <td class="r mono">{{ fmtAxis(imuRightGyroVec, 'y') }}</td>
                <td class="r mono">{{ fmtAxis(imuRightGyroVec, 'z') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

    </div>

    <!-- Sidebar -->
    <aside class="telem-sidebar">
      <div class="sb-title">Telemetry</div>

      <section class="sb-sec">
        <h2 class="sb-sec-title">Visualizations</h2>
        <label class="tog-row">
          <span class="tog-lbl">Depth Chart</span>
          <span class="sw"><input type="checkbox" v-model="showChart" /><span class="knob"/></span>
        </label>
        <label class="tog-row">
          <span class="tog-lbl">Attitude</span>
          <span class="sw"><input type="checkbox" v-model="showUUV" /><span class="knob"/></span>
        </label>
        <label class="tog-row">
          <span class="tog-lbl">BCU Commands</span>
          <span class="sw"><input type="checkbox" v-model="showBcu" /><span class="knob"/></span>
        </label>
        <label class="tog-row">
          <span class="tog-lbl">ACU Commands</span>
          <span class="sw"><input type="checkbox" v-model="showAcu" /><span class="knob"/></span>
        </label>
      </section>

      <section class="sb-sec">
        <h2 class="sb-sec-title">Display Units</h2>
        <div class="dim small">
          Pressure unit ({{ pressureUnit }}) is set in the app bar &mdash; affects
          External &amp; Tank pressure readouts here.
        </div>
      </section>
    </aside>

  </div>
</template>

<style scoped>
/* ── Root ──────────────────────────────────────────────────────────────── */
.telem-root {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}

.telem-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  min-width: 0;
  overflow-y: auto;
}

/* ── Panels shared ─────────────────────────────────────────────────────── */
.viz-panel, .cmd-panel, .table-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  transition: background var(--transition), border-color var(--transition);
}

.panel-title {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  margin-bottom: 10px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ── Viz row ───────────────────────────────────────────────────────────── */
.viz-row {
  flex: 0 0 auto;
  display: flex;
  gap: 12px;
  height: 380px;
}
.viz-panel { flex: 1 1 0; min-width: 0; }
.viz-body { flex: 1 1 auto; min-height: 0; position: relative; }

.view-toggle { display: flex; gap: 2px; margin-left: auto; }
.vt-btn {
  font-family: var(--font-ui);
  font-size: 9px; font-weight: 600; letter-spacing: 0.06em;
  padding: 2px 8px;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn); color: var(--text-hint);
  transition: background var(--transition), color var(--transition);
}
.vt-btn:hover  { background: var(--accent-hover-bg); color: var(--text-muted); }
.vt-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

/* Y-axis manual-bounds control on the depth panel header. Mirrors the
   2D/3D view-toggle slot on the Attitude panel so the two panels read
   as a pair. Inputs are intentionally narrow -- this is a quick pin,
   not a free-form numeric editor. */
.y-axis-ctl {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.y-axis-lbl {
  font-family: var(--font-ui);
  font-size: 9px; font-weight: 600; letter-spacing: 0.08em;
  color: var(--text-hint);
}
.y-axis-ctl input {
  width: 56px;
  padding: 2px 5px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text);
  background: var(--bg-btn);
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  outline: none;
  transition: border-color var(--transition), background var(--transition);
}
.y-axis-ctl input:focus { border-color: var(--accent); }
.y-axis-ctl input::placeholder { color: var(--text-hint); }
/* Hide the spinner so the inputs stay tight at 56px wide. */
.y-axis-ctl input::-webkit-outer-spin-button,
.y-axis-ctl input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.y-axis-ctl input[type=number] { -moz-appearance: textfield; }

/* ── Cmd row (mission + BCU + ACU) ─────────────────────────────────────── */
.cmd-row {
  display: flex; gap: 12px; flex: 0 0 auto;
}
.cmd-panel {
  flex: 1 1 0; min-width: 0; min-height: 220px;
}

.kv-grid {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 12px;
  font-family: var(--font-ui);
  font-size: 12px;
  align-items: center;
}
.kv-key {
  color: var(--text-hint); font-size: 10.5px;
  text-transform: uppercase; letter-spacing: 0.06em;
}
.kv-val { color: var(--text); }
.kv-val.mono { font-family: var(--font-mono); font-size: 12.5px; }

.strip-body {
  flex: 1 1 auto;
  min-height: 80px;
  margin-top: 10px;
  position: relative;
}

/* ── Mission state badges ──────────────────────────────────────────────── */
.state-badge {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10.5px; font-weight: 600;
  padding: 1px 6px;
  border-radius: 2px;
  border: 1px solid currentColor;
  letter-spacing: 0.04em;
}
.state-idle    { color: var(--text-hint); }
.state-loaded  { color: var(--status-q-text); }
.state-running { color: var(--status-ok-text); }

.timeline {
  margin-top: 12px;
  border-top: 1px solid var(--border-divider);
  padding-top: 8px;
}
.timeline-label {
  font-family: var(--font-ui);
  font-size: 9.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-hint);
  margin-bottom: 5px;
}
.timeline-row {
  display: grid;
  grid-template-columns: 90px 1fr max-content;
  gap: 6px;
  align-items: center;
  font-size: 11px;
  padding: 2px 0;
}

/* ── Valve LEDs ────────────────────────────────────────────────────────── */
.valve-led {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10.5px; font-weight: 600;
  padding: 1px 6px;
  margin-right: 4px;
  border: 1px solid var(--border-btn);
  border-radius: 2px;
  color: var(--text-hint);
  background: var(--bg-btn);
}
.valve-led.on {
  color: var(--status-ok-text);
  border-color: var(--status-ok-border);
  background: var(--status-ok-bg);
}

/* ── Bottom row: data + IMU ───────────────────────────────────────────── */
.bottom-row {
  display: flex; gap: 12px; flex: 0 0 auto;
}
.table-panel { flex: 1 1 0; min-width: 0; }
.imu-panel   { flex: 1 1 0; min-width: 0; }

/* Visual gap between accel.{xyz} and gyro.{xyz} column groups so the
   two sensor blocks read as a unit rather than six anonymous numbers. */
.imu-axis-table th.sep,
.imu-axis-table td.sep {
  border-left: 1px solid var(--border-divider);
  padding-left: 14px;
}

.table-wrap { flex: 1; }

/* ── Data table ───────────────────────────────────────────────────────── */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-ui);
  font-size: 13px;
  user-select: text;
}
.data-table th {
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-hint);
  padding: 7px 12px; text-align: left;
  border-bottom: 1px solid var(--border-divider);
}
.data-table td {
  padding: 7px 12px;
  color: var(--text);
  border-bottom: 1px solid var(--border-divider);
}
.data-table .r    { text-align: right; }
.data-table .mono { font-family: var(--font-mono); font-size: 12.5px; }
.data-table .dim  { color: var(--text-hint); font-size: 11.5px; }

.small { font-size: 11px; }
.dim   { color: var(--text-hint); }

/* ── Sidebar ───────────────────────────────────────────────────────────── */
.telem-sidebar {
  flex: 0 0 200px;
  display: flex; flex-direction: column;
  overflow-y: auto;
  padding: 16px 13px;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border-sidebar);
  transition: background var(--transition);
}
.sb-title {
  font-family: var(--font-sub);
  font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-muted);
  padding-bottom: 10px; margin-bottom: 14px;
  border-bottom: 1px solid var(--border-divider);
}
.sb-sec { margin-bottom: 18px; }
.sb-sec-title {
  font-family: var(--font-ui);
  font-size: 9.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-hint);
  margin-bottom: 9px; padding-bottom: 5px;
  border-bottom: 1px solid var(--border-divider);
}

.tog-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px; cursor: pointer; gap: 6px;
}
.tog-lbl { font-family: var(--font-ui); font-size: 11.5px; color: var(--text); flex: 1; }
.sw { position: relative; display: inline-block; width: 32px; height: 17px; flex-shrink: 0; }
.sw input { opacity: 0; width: 0; height: 0; }
.knob {
  position: absolute; inset: 0; background: var(--border); border-radius: 17px;
  transition: background 0.2s;
}
.knob::before {
  content: ''; position: absolute; width: 11px; height: 11px; left: 3px; top: 3px;
  background: #fff; border-radius: 50%; transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.22);
}
.sw input:checked + .knob { background: var(--accent); }
.sw input:checked + .knob::before { transform: translateX(15px); }
</style>
