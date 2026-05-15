<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Title, CategoryScale, Tooltip, Filler
} from 'chart.js'
import { useDataLogStore } from '@/store/datalogs'
import { useSimulationStore } from '@/store/simulations'
import { storeToRefs } from 'pinia'
import { LineChart } from 'vue-chart-3'
import { DateTime } from 'luxon'
import { useTheme } from '@/composables/useTheme'
import AttitudeIndicator from '@/components/AttitudeIndicator.vue'
import UUVViewer from '@/components/UUVViewer.vue'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Filler)

const { isDark } = useTheme()
const dataLogStore = useDataLogStore()
const { dataLogs } = storeToRefs(dataLogStore)
const { resetLeak } = dataLogStore

const simStore = useSimulationStore()
const { overlayEnabled, simDepths } = storeToRefs(simStore)

// Viz panel visibility
const showChart  = ref(true)
const showUUV    = ref(true)
const attitudeMode = ref<'2d' | '3d'>('2d')

// ── Sensor visibility ────────────────────────────────────────────────
const showSensor = ref<Record<string, boolean>>({
  depth:     true,
  target:    true,
  hullP:     true,
  tankP:     true,
  extP:      true,
  posX:      true,
  posY:      true,
  posZ:      true,
  roll:      true,
  pitch:     true,
  yaw:       true,
  leakage:   true,
  system:    true,
})

const sensorToggles = [
  { key: 'depth',   label: 'Depth' },
  { key: 'target',  label: 'Target Depth' },
  { key: 'hullP',   label: 'Internal (Hull) Pressure' },
  { key: 'tankP',   label: 'Tank Pressure' },
  { key: 'extP',    label: 'External Pressure' },
  { key: 'posX',    label: 'Position X' },
  { key: 'posY',    label: 'Position Y' },
  { key: 'posZ',    label: 'Position Z' },
  { key: 'roll',    label: 'Roll' },
  { key: 'pitch',   label: 'Pitch' },
  { key: 'yaw',     label: 'Yaw' },
  { key: 'leakage', label: 'Leakage' },
  { key: 'system',  label: 'System' },
]

// ── Computed sensor values (for attitude + chart) ─────────────────────
const latestDepth = computed(() => dataLogs.value.depths?.[0]?.depth ?? 0)
const latestPose  = computed(() => dataLogs.value.poses?.[0] ?? { x:0,y:0,z:0,qw:1,qx:0,qy:0,qz:0,record_datetime:'' })

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

// ── Data table rows ───────────────────────────────────────────────────
interface TableRow {
  key: string; sensor: string; value: string; unit: string; time: string
  status?: 'ok' | 'err'
  action?: 'reset-leak'
}

const allRows = computed<TableRow[]>(() => {
  const d = dataLogs.value
  const depth   = d.depths[0]
  const target  = d.targetDepths[0]
  const pose    = d.poses[0]
  const hullP   = d.pressures.find(p => p.location === 'hull')
  const tankP   = d.pressures.find(p => p.location === 'tank')
  const extP    = d.pressures.find(p => p.location === 'ext')
  const leak    = d.leakages[0]
  const alive   = d.alives?.every(a => a.is_alive) ?? false
  const aliveTs = d.alives?.[0]?.record_datetime ?? ''
  const euler   = pose ? qToEuler(pose.qw, pose.qx, pose.qy, pose.qz) : { roll:0, pitch:0, yaw:0 }

  return [
    { key: 'depth',   sensor: 'Depth',                     value: depth?.depth.toFixed(3)    ?? '—', unit: 'm',    time: fmtTs(depth?.record_datetime ?? '') },
    { key: 'target',  sensor: 'Target Depth',              value: target?.depth.toFixed(3)   ?? '—', unit: 'm',    time: fmtTs(target?.record_datetime ?? '') },
    { key: 'hullP',   sensor: 'Internal (Hull) Pressure',  value: hullP?.pressure.toFixed(4) ?? '—', unit: 'barg', time: fmtTs(hullP?.record_datetime ?? '') },
    { key: 'tankP',   sensor: 'Tank Pressure',             value: tankP?.pressure.toFixed(4) ?? '—', unit: 'barg', time: fmtTs(tankP?.record_datetime ?? '') },
    { key: 'extP',    sensor: 'External Pressure',         value: extP?.pressure.toFixed(4)  ?? '—', unit: 'bar',  time: fmtTs(extP?.record_datetime ?? '') },
    { key: 'posX',    sensor: 'Position X',               value: pose?.x.toFixed(4)         ?? '—', unit: 'm',    time: fmtTs(pose?.record_datetime ?? '') },
    { key: 'posY',    sensor: 'Position Y',               value: pose?.y.toFixed(4)         ?? '—', unit: 'm',    time: fmtTs(pose?.record_datetime ?? '') },
    { key: 'posZ',    sensor: 'Position Z',               value: pose?.z.toFixed(4)         ?? '—', unit: 'm',    time: fmtTs(pose?.record_datetime ?? '') },
    { key: 'roll',    sensor: 'Roll',                      value: euler.roll.toFixed(2),              unit: '°',    time: fmtTs(pose?.record_datetime ?? '') },
    { key: 'pitch',   sensor: 'Pitch',                     value: euler.pitch.toFixed(2),             unit: '°',    time: fmtTs(pose?.record_datetime ?? '') },
    { key: 'yaw',     sensor: 'Yaw',                       value: euler.yaw.toFixed(2),               unit: '°',    time: fmtTs(pose?.record_datetime ?? '') },
    { key: 'leakage', sensor: 'Leakage',                   value: leak?.has_leak ? 'LEAK' : 'Nominal', unit: '—', time: fmtTs(leak?.record_datetime ?? ''), status: leak?.has_leak ? 'err' : 'ok', action: 'reset-leak' },
    { key: 'system',  sensor: 'System',                    value: alive ? 'Online' : 'Offline',        unit: '—', time: fmtTs(aliveTs), status: alive ? 'ok' : 'err' },
  ]
})

const tableRows = computed(() => allRows.value.filter(r => showSensor.value[r.key]))

// ── Event log ─────────────────────────────────────────────────────────
interface EventEntry { time: string; event: string; detail: string; severity: 'err' | 'warn' }

const events = computed<EventEntry[]>(() => {
  const entries: EventEntry[] = []
  for (const l of dataLogs.value.leakages) {
    if (l.has_leak) entries.push({ time: fmtTs(l.record_datetime), event: 'Leak Detected', detail: `Location: ${l.location}`, severity: 'err' })
  }
  for (const a of dataLogs.value.alives) {
    if (!a.is_alive) entries.push({ time: fmtTs(a.record_datetime), event: 'System Offline', detail: 'Subsystem not alive', severity: 'warn' })
  }
  return entries.sort((a, b) => b.time.localeCompare(a.time))
})

// ── Depth chart ───────────────────────────────────────────────────────
const newestDepth = computed(() => dataLogs.value.depths?.slice(0,30).reverse() ?? [])
const depthValues = computed<number[]>(() => newestDepth.value.map(d => -d.depth))
const labels      = computed<string[]>(() => newestDepth.value.map(d => DateTime.fromISO(d.record_datetime,{zone:'system'}).toFormat('HH:mm:ss')))
const simVals     = computed<number[]>(() => simDepths.value.slice(0,30).reverse().map(d => -d.depth))

const chartData = computed(() => ({
  labels: labels.value,
  datasets: [
    {
      label: 'Depth (m)',
      data: depthValues.value,
      borderColor: isDark.value ? '#6090d8' : '#4a7fcb',
      backgroundColor: isDark.value ? 'rgba(96,144,216,0.07)' : 'rgba(74,127,203,0.07)',
      fill: true, tension: 0.3, pointRadius: 2,
      pointBackgroundColor: isDark.value ? '#6090d8' : '#4a7fcb',
      borderWidth: 1.5,
    },
    ...(overlayEnabled.value ? [{
      label: 'Simulated (m)',
      data: simVals.value,
      borderColor: isDark.value ? '#d09040' : '#c07818',
      backgroundColor: 'transparent',
      fill: false, tension: 0.3, pointRadius: 2,
      pointBackgroundColor: isDark.value ? '#d09040' : '#c07818',
      borderWidth: 1.5, borderDash: [4,3],
    }] : [])
  ]
}))

const chartOptions = computed(() => ({
  scales: {
    x: {
      ticks: { font:{family:'Inter, sans-serif',size:10}, color: isDark.value ? '#606080' : '#808090', maxRotation:30 },
      grid:  { color: isDark.value ? '#21212e' : '#e8e8ee' },
      title: { display:true, text:'Time', font:{family:'Inter, sans-serif',size:10}, color: isDark.value ? '#505060' : '#909090' }
    },
    y: {
      min:-100, max:0,
      ticks: { stepSize:10, font:{family:'Inter, sans-serif',size:10}, color: isDark.value ? '#606080' : '#808090' },
      grid:  { color: isDark.value ? '#21212e' : '#e8e8ee' },
      title: { display:true, text:'Depth (m)', font:{family:'Inter, sans-serif',size:10}, color: isDark.value ? '#505060' : '#909090' }
    }
  },
  plugins: {
    legend: { labels: { font:{family:'Inter, sans-serif',size:11}, color: isDark.value ? '#909090' : '#606060', boxWidth:12 } },
    tooltip: { titleFont:{family:'Inter, sans-serif',size:11}, bodyFont:{family:'Inter, sans-serif',size:11} }
  },
  responsive: true,
  maintainAspectRatio: false,
}))
</script>

<template>
  <div class="telem-root">

    <!-- ── Main scrollable area ──────────────────────────────── -->
    <div class="telem-main">

      <!-- Viz panels — depth chart + attitude -->
      <div v-if="showChart || showUUV" class="viz-row">

        <div v-if="showChart" class="viz-panel">
          <div class="panel-title">
            Depth over Time<em v-if="overlayEnabled" class="sim-em"> + simulation</em>
          </div>
          <div class="viz-body">
            <LineChart :chartData="chartData" :options="chartOptions" style="width:100%;height:100%" />
          </div>
        </div>

        <div v-if="showUUV" class="viz-panel">
          <div class="panel-title">
            Attitude
            <div class="view-toggle">
              <button class="vt-btn" :class="{ active: attitudeMode === '2d' }" @click="attitudeMode = '2d'" title="2D Indicator">2D</button>
              <button class="vt-btn" :class="{ active: attitudeMode === '3d' }" @click="attitudeMode = '3d'" title="3D Model">3D</button>
            </div>
          </div>
          <div class="viz-body">
            <AttitudeIndicator
              v-if="attitudeMode === '2d'"
              :qw="latestPose.qw"
              :qx="latestPose.qx"
              :qy="latestPose.qy"
              :qz="latestPose.qz"
              :depth="latestDepth"
            />
            <UUVViewer
              v-else
              :qw="latestPose.qw"
              :qx="latestPose.qx"
              :qy="latestPose.qy"
              :qz="latestPose.qz"
              :depth="latestDepth"
            />
          </div>
        </div>

      </div>

      <!-- Data table + Event log -->
      <div class="bottom-row">

        <div class="table-panel">
          <div class="panel-title">All Current Values</div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Sensor</th>
                  <th class="r">Value</th>
                  <th>Unit</th>
                  <th>Last Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in tableRows" :key="row.sensor">
                  <td>{{ row.sensor }}</td>
                  <td class="r mono" :class="row.status ? `st-${row.status}` : ''">{{ row.value }}</td>
                  <td class="dim">{{ row.unit }}</td>
                  <td class="mono dim">{{ row.time }}</td>
                  <td class="act-cell">
                    <button v-if="row.action === 'reset-leak'" class="icon-act" @click="resetLeak" title="Reset leak">
                      <v-icon size="10">mdi-refresh</v-icon>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="table-panel event-panel">
          <div class="panel-title">Event Log</div>
          <div class="table-wrap">
            <div v-if="events.length === 0" class="empty-log">No events recorded</div>
            <table v-else class="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(evt, i) in events" :key="i" :class="`ev-${evt.severity}`">
                  <td class="mono">{{ evt.time }}</td>
                  <td class="fw">{{ evt.event }}</td>
                  <td class="dim">{{ evt.detail }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>

    <!-- ── Sidebar ───────────────────────────────────────────── -->
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
      </section>

      <section class="sb-sec">
        <h2 class="sb-sec-title">Sensors</h2>
        <label v-for="item in sensorToggles" :key="item.key" class="tog-row">
          <span class="tog-lbl">{{ item.label }}</span>
          <span class="sw">
            <input type="checkbox" v-model="showSensor[item.key]" />
            <span class="knob" />
          </span>
        </label>
      </section>

      <section class="sb-sec">
        <h2 class="sb-sec-title">Simulation</h2>
        <label class="tog-row">
          <span class="tog-lbl">Overlay</span>
          <span class="sw"><input type="checkbox" v-model="overlayEnabled" /><span class="knob"/></span>
        </label>
        <router-link to="/simulations" class="cfg-link">Configure &rarr;</router-link>
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

/* ── Main area ─────────────────────────────────────────────────────────── */
.telem-main {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  min-width: 0;
  overflow-y: auto;
}

/* ── Viz row ───────────────────────────────────────────────────────────── */
.viz-row {
  flex: 0 0 auto;
  display: flex;
  gap: 12px;
  height: 380px;
}

.viz-panel {
  flex: 1 1 0;
  min-width: 0;
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

.view-toggle {
  display: flex;
  gap: 2px;
  margin-left: auto;
}
.vt-btn {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 2px 8px;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn);
  color: var(--text-hint);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.vt-btn:hover { background: var(--accent-hover-bg); color: var(--text-muted); }
.vt-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.sim-em {
  font-size: 10px;
  font-weight: 400;
  font-style: italic;
  text-transform: none;
  letter-spacing: 0.02em;
  color: var(--text-hint);
}

.viz-body {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

/* ── Bottom row: table + event log ────────────────────────────────────── */
.bottom-row {
  display: flex;
  gap: 12px;
  flex: 0 0 auto;
}

.table-panel {
  flex: 1 1 0;
  min-width: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  transition: background var(--transition), border-color var(--transition);
}

.event-panel { flex: 0 0 300px; }

.table-wrap {
  flex: 1;
}

/* ── Data table ───────────────────────────────────────────────────────── */
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-ui);
  font-size: 13px;
  user-select: text;
}

.data-table th {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-hint);
  padding: 7px 12px;
  text-align: left;
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
.data-table .fw   { font-weight: 500; }

.st-ok  { color: var(--status-ok-text); }
.st-err { color: var(--status-err-text); }

.ev-err td { color: var(--status-err-text); }
.ev-warn td { color: var(--status-q-text); }

.act-cell { width: 24px; padding: 2px !important; }

.icon-act {
  display: inline-flex; align-items: center; justify-content: center;
  width: 18px; height: 18px;
  border: 1px solid var(--border-btn); border-radius: 3px;
  cursor: pointer; background: var(--bg-btn); color: var(--text-muted);
  transition: background var(--transition);
}
.icon-act:hover { background: var(--accent-hover-bg); color: var(--accent); }

.empty-log {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-hint);
  padding: 20px 0;
  text-align: center;
}

/* ── Sidebar ───────────────────────────────────────────────────────────── */
.telem-sidebar {
  flex: 0 0 200px;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  padding: 16px 13px;
  background: var(--bg-sidebar);
  border-left: 1px solid var(--border-sidebar);
  transition: background var(--transition);
}

.sb-title {
  font-family: var(--font-sub);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  padding-bottom: 10px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-divider);
}

.sb-sec { margin-bottom: 18px; }
.sb-sec-title {
  font-family: var(--font-ui);
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-hint);
  margin-bottom: 9px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--border-divider);
}

/* ── Toggle rows ───────────────────────────────────────────────────────── */
.tog-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px; cursor: pointer; gap: 6px;
}
.tog-lbl { font-family: var(--font-ui); font-size: 11.5px; color: var(--text); flex: 1; }

.sw { position: relative; display: inline-block; width: 32px; height: 17px; flex-shrink: 0; }
.sw input { opacity: 0; width: 0; height: 0; }
.knob {
  position: absolute; inset: 0; background: var(--border); border-radius: 17px; transition: background 0.2s;
}
.knob::before {
  content: ''; position: absolute; width: 11px; height: 11px; left: 3px; top: 3px;
  background: #fff; border-radius: 50%; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.22);
}
.sw input:checked + .knob { background: var(--accent); }
.sw input:checked + .knob::before { transform: translateX(15px); }

.cfg-link { font-family: var(--font-ui); font-size: 10.5px; color: var(--accent); text-decoration: none; display: block; margin-top: 5px; }
.cfg-link:hover { text-decoration: underline; }
</style>
