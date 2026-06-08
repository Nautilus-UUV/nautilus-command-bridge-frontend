<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Title, CategoryScale, Tooltip, Filler, Legend
} from 'chart.js'
import { useTelemetryStore } from '@/store/telemetry'
import { storeToRefs } from 'pinia'
import { LineChart } from 'vue-chart-3'
import { DateTime } from 'luxon'
import { useTheme } from '@/composables/useTheme'
import { useUnits } from '@/composables/useUnits'
import { useTelemetryCharts } from '@/composables/useTelemetryCharts'
import AttitudeIndicator from '@/components/AttitudeIndicator.vue'
import UUVViewer from '@/components/UUVViewer.vue'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Filler, Legend)

const { isDark } = useTheme()
const { pressureUnit, formatPressure } = useUnits()

const telemStore = useTelemetryStore()
const {
  position, positionTarget,
  imuLeft, imuRight,
  bcuPressure, externalPressure,
  missionActive,
} = storeToRefs(telemStore)

// Strip-chart configs are shared with the Commands tab through this
// composable, so the depth / BCU / ACU graphs stay identical on both pages.
// Alias each group back to the names the template already uses so the markup
// below is untouched.
const charts = useTelemetryCharts()
const { data: chartData, options: chartOptions, yMin, yMax, reset: resetYBounds } = charts.depth
const { data: bcuChartData, options: bcuChartOptions, yMin: bcuYMin, yMax: bcuYMax,
        latestRpm, motorValveOpen, freeValveOpen } = charts.bcu
const { data: acuChartData, options: acuChartOptions, yMin: acuYMin, yMax: acuYMax,
        pitchMmText, rollDegText } = charts.acu

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

const activeMission = computed(() => missionActive.value[0]?.value ?? null)
const missionTimeline = computed(() => missionActive.value.slice(0, 5))

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
              <span class="valve-led" :class="{ on: freeValveOpen }" title="Valve 1 (free way)">V1</span>
              <span class="valve-led" :class="{ on: motorValveOpen }" title="Valve 2 (motor way)">V2</span>
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
