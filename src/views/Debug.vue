<script setup lang="ts">
import { computed } from 'vue'
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Title, CategoryScale, Tooltip, Legend, Filler
} from 'chart.js'
import { LineChart } from 'vue-chart-3'
import { useDataLogStore } from '@/store/datalogs'
import { storeToRefs } from 'pinia'
import { DateTime } from 'luxon'
import { useTheme } from '@/composables/useTheme'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Legend, Filler)

const { isDark } = useTheme()
const dataLogStore = useDataLogStore()
const { dataLogs } = storeToRefs(dataLogStore)

// ── Helpers ────────────────────────────────────────────────────────────
function fmtTime(iso: string) {
  return iso ? DateTime.fromISO(iso, { zone: 'system' }).toFormat('HH:mm:ss') : '—'
}

function fmtTimeFull(iso: string) {
  return iso ? DateTime.fromISO(iso, { zone: 'system' }).toFormat('HH:mm:ss.SSS') : '—'
}

const gridColor = computed(() => isDark.value ? '#21212e' : '#e8e8ee')
const tickColor = computed(() => isDark.value ? '#606080' : '#808090')
const titleColor = computed(() => isDark.value ? '#505060' : '#909090')
const legendColor = computed(() => isDark.value ? '#909090' : '#606060')

function baseOpts(yLabel: string, yMin?: number, yMax?: number) {
  return computed(() => ({
    scales: {
      x: {
        ticks: { font: { family: 'Inter, sans-serif', size: 9 }, color: tickColor.value, maxRotation: 30, maxTicksLimit: 8 },
        grid: { color: gridColor.value },
        title: { display: false },
      },
      y: {
        ...(yMin !== undefined ? { min: yMin } : {}),
        ...(yMax !== undefined ? { max: yMax } : {}),
        ticks: { font: { family: 'Inter, sans-serif', size: 9 }, color: tickColor.value },
        grid: { color: gridColor.value },
        title: { display: true, text: yLabel, font: { family: 'Inter, sans-serif', size: 9 }, color: titleColor.value },
      },
    },
    plugins: {
      legend: { labels: { font: { family: 'Inter, sans-serif', size: 10 }, color: legendColor.value, boxWidth: 10 } },
      tooltip: { titleFont: { family: 'Inter, sans-serif', size: 10 }, bodyFont: { family: 'Inter, sans-serif', size: 10 } },
    },
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
  }))
}

// ── Chart palettes ────────────────────────────────────────────────────
const colors = {
  blue:   () => isDark.value ? '#6090d8' : '#4a7fcb',
  orange: () => isDark.value ? '#d09040' : '#c07818',
  green:  () => isDark.value ? '#60a860' : '#388838',
  red:    () => isDark.value ? '#c06060' : '#a83030',
  purple: () => isDark.value ? '#9070c0' : '#7050a0',
  cyan:   () => isDark.value ? '#50b0c0' : '#308090',
}

function ds(label: string, data: number[], colorFn: () => string, dashed = false) {
  return {
    label,
    data,
    borderColor: colorFn(),
    backgroundColor: 'transparent',
    fill: false,
    tension: 0.3,
    pointRadius: 1.5,
    pointBackgroundColor: colorFn(),
    borderWidth: 1.5,
    ...(dashed ? { borderDash: [4, 3] } : {}),
  }
}

// ── Depth chart ───────────────────────────────────────────────────────
const depthSlice = computed(() => dataLogs.value.depths.slice(0, 60).reverse())
const targetSlice = computed(() => dataLogs.value.targetDepths.slice(0, 60).reverse())
const depthLabels = computed(() => depthSlice.value.map(d => fmtTime(d.record_datetime)))
const depthChartData = computed(() => ({
  labels: depthLabels.value,
  datasets: [
    ds('Depth (m)', depthSlice.value.map(d => d.depth), colors.blue),
    ds('Target (m)', targetSlice.value.map(d => d.depth), colors.orange, true),
  ],
}))
const depthOpts = baseOpts('Depth (m)')

// ── Pressure chart ────────────────────────────────────────────────────
const pressureByLoc = computed(() => {
  const hull: { t: string; v: number }[] = []
  const tank: { t: string; v: number }[] = []
  const ext: { t: string; v: number }[] = []
  for (const p of [...dataLogs.value.pressures].reverse()) {
    const entry = { t: fmtTime(p.record_datetime), v: p.pressure }
    if (p.location === 'hull') hull.push(entry)
    else if (p.location === 'tank') tank.push(entry)
    else if (p.location === 'ext') ext.push(entry)
  }
  return { hull: hull.slice(-60), tank: tank.slice(-60), ext: ext.slice(-60) }
})
const pressureLabels = computed(() => {
  const all = pressureByLoc.value
  const longest = [all.hull, all.tank, all.ext].sort((a, b) => b.length - a.length)[0]
  return longest.map(e => e.t)
})
const pressureChartData = computed(() => ({
  labels: pressureLabels.value,
  datasets: [
    ds('Internal (Hull) (barg)', pressureByLoc.value.hull.map(e => e.v), colors.blue),
    ds('Tank (barg)', pressureByLoc.value.tank.map(e => e.v), colors.orange),
    ds('External (bar)', pressureByLoc.value.ext.map(e => e.v), colors.green),
  ],
}))
const pressureOpts = baseOpts('Pressure')

// ── Position chart ────────────────────────────────────────────────────
const poseSlice = computed(() => dataLogs.value.poses.slice(0, 60).reverse())
const posLabels = computed(() => poseSlice.value.map(p => fmtTime(p.record_datetime)))
const posChartData = computed(() => ({
  labels: posLabels.value,
  datasets: [
    ds('X', poseSlice.value.map(p => p.x), colors.blue),
    ds('Y', poseSlice.value.map(p => p.y), colors.orange),
    ds('Z', poseSlice.value.map(p => p.z), colors.green),
  ],
}))
const posOpts = baseOpts('Position (m)')

// ── Attitude chart ────────────────────────────────────────────────────
function qToEuler(qw: number, qx: number, qy: number, qz: number) {
  const roll = Math.atan2(2 * (qw * qx + qy * qz), 1 - 2 * (qx * qx + qy * qy)) * 180 / Math.PI
  const sinp = 2 * (qw * qy - qz * qx)
  const pitch = (Math.abs(sinp) >= 1 ? Math.sign(sinp) * 90 : Math.asin(sinp) * 180 / Math.PI)
  const yaw = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz)) * 180 / Math.PI
  return { roll, pitch, yaw }
}
const attLabels = computed(() => poseSlice.value.map(p => fmtTime(p.record_datetime)))
const attChartData = computed(() => {
  const eulers = poseSlice.value.map(p => qToEuler(p.qw, p.qx, p.qy, p.qz))
  return {
    labels: attLabels.value,
    datasets: [
      ds('Roll', eulers.map(e => e.roll), colors.blue),
      ds('Pitch', eulers.map(e => e.pitch), colors.orange),
      ds('Yaw', eulers.map(e => e.yaw), colors.purple),
    ],
  }
})
const attOpts = baseOpts('Angle (deg)')

// ── Data table rows ───────────────────────────────────────────────────
interface TableRow {
  sensor: string
  value: string
  unit: string
  time: string
  status?: 'ok' | 'warn' | 'err'
}

const tableRows = computed<TableRow[]>(() => {
  const d = dataLogs.value
  const latestDepth = d.depths[0]
  const latestTarget = d.targetDepths[0]
  const latestPose = d.poses[0]
  const hullP = d.pressures.find(p => p.location === 'hull')
  const tankP = d.pressures.find(p => p.location === 'tank')
  const extP = d.pressures.find(p => p.location === 'ext')
  const leak = d.leakages[0]
  const alive = d.alives?.every(a => a.is_alive)
  const aliveTs = d.alives?.[0]?.record_datetime ?? ''

  const euler = latestPose ? qToEuler(latestPose.qw, latestPose.qx, latestPose.qy, latestPose.qz) : { roll: 0, pitch: 0, yaw: 0 }

  return [
    { sensor: 'Depth', value: latestDepth?.depth.toFixed(3) ?? '—', unit: 'm', time: fmtTimeFull(latestDepth?.record_datetime ?? '') },
    { sensor: 'Target Depth', value: latestTarget?.depth.toFixed(3) ?? '—', unit: 'm', time: fmtTimeFull(latestTarget?.record_datetime ?? '') },
    { sensor: 'Internal (Hull) Pressure', value: hullP?.pressure.toFixed(4) ?? '—', unit: 'barg', time: fmtTimeFull(hullP?.record_datetime ?? '') },
    { sensor: 'Tank Pressure', value: tankP?.pressure.toFixed(4) ?? '—', unit: 'barg', time: fmtTimeFull(tankP?.record_datetime ?? '') },
    { sensor: 'External Pressure', value: extP?.pressure.toFixed(4) ?? '—', unit: 'bar', time: fmtTimeFull(extP?.record_datetime ?? '') },
    { sensor: 'Position X', value: latestPose?.x.toFixed(4) ?? '—', unit: 'm', time: fmtTimeFull(latestPose?.record_datetime ?? '') },
    { sensor: 'Position Y', value: latestPose?.y.toFixed(4) ?? '—', unit: 'm', time: fmtTimeFull(latestPose?.record_datetime ?? '') },
    { sensor: 'Position Z', value: latestPose?.z.toFixed(4) ?? '—', unit: 'm', time: fmtTimeFull(latestPose?.record_datetime ?? '') },
    { sensor: 'Roll', value: euler.roll.toFixed(2), unit: '°', time: fmtTimeFull(latestPose?.record_datetime ?? '') },
    { sensor: 'Pitch', value: euler.pitch.toFixed(2), unit: '°', time: fmtTimeFull(latestPose?.record_datetime ?? '') },
    { sensor: 'Yaw', value: euler.yaw.toFixed(2), unit: '°', time: fmtTimeFull(latestPose?.record_datetime ?? '') },
    { sensor: 'Leakage', value: leak?.has_leak ? 'LEAK' : 'Nominal', unit: '—', time: fmtTimeFull(leak?.record_datetime ?? ''), status: leak?.has_leak ? 'err' : 'ok' },
    { sensor: 'System', value: alive ? 'Online' : 'Offline', unit: '—', time: fmtTimeFull(aliveTs), status: alive ? 'ok' : 'err' },
  ]
})

// ── Event log ─────────────────────────────────────────────────────────
interface EventEntry {
  time: string
  event: string
  detail: string
  severity: 'info' | 'warn' | 'err'
}

const events = computed<EventEntry[]>(() => {
  const entries: EventEntry[] = []

  for (const l of dataLogs.value.leakages) {
    if (l.has_leak) {
      entries.push({
        time: fmtTimeFull(l.record_datetime),
        event: 'Leak Detected',
        detail: `Location: ${l.location}`,
        severity: 'err',
      })
    }
  }

  for (const a of dataLogs.value.alives) {
    if (!a.is_alive) {
      entries.push({
        time: fmtTimeFull(a.record_datetime),
        event: 'System Offline',
        detail: 'Subsystem reported not alive',
        severity: 'warn',
      })
    }
  }

  return entries.sort((a, b) => b.time.localeCompare(a.time))
})
</script>

<template>
  <div class="debug-root">

    <!-- Chart grid -->
    <div class="chart-grid">
      <div class="chart-panel">
        <div class="chart-title">Depth & Target</div>
        <div class="chart-body">
          <LineChart :chartData="depthChartData" :options="depthOpts" style="width:100%;height:100%" />
        </div>
      </div>

      <div class="chart-panel">
        <div class="chart-title">Pressures</div>
        <div class="chart-body">
          <LineChart :chartData="pressureChartData" :options="pressureOpts" style="width:100%;height:100%" />
        </div>
      </div>

      <div class="chart-panel">
        <div class="chart-title">Position (X, Y, Z)</div>
        <div class="chart-body">
          <LineChart :chartData="posChartData" :options="posOpts" style="width:100%;height:100%" />
        </div>
      </div>

      <div class="chart-panel">
        <div class="chart-title">Attitude (Roll, Pitch, Yaw)</div>
        <div class="chart-body">
          <LineChart :chartData="attChartData" :options="attOpts" style="width:100%;height:100%" />
        </div>
      </div>
    </div>

    <!-- Bottom section: data table + event log side by side -->
    <div class="bottom-row">

      <!-- Data table -->
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
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableRows" :key="row.sensor">
                <td>{{ row.sensor }}</td>
                <td class="r mono" :class="row.status ? `st-${row.status}` : ''">{{ row.value }}</td>
                <td class="dim">{{ row.unit }}</td>
                <td class="mono dim">{{ row.time }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Event log -->
      <div class="table-panel">
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
</template>

<style scoped>
.debug-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  background: var(--bg);
}

/* ── Chart grid ───────────────────────────────────────────────────────── */
.chart-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.chart-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  min-height: 220px;
  transition: background var(--transition), border-color var(--transition);
}

.chart-title {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  margin-bottom: 10px;
  flex-shrink: 0;
}

.chart-body {
  flex: 1 1 auto;
  min-height: 0;
  position: relative;
}

/* ── Bottom row ───────────────────────────────────────────────────────── */
.bottom-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.table-panel {
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
  flex-shrink: 0;
}

.table-wrap {
  flex: 1;
  overflow-y: auto;
  max-height: 320px;
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
  position: sticky;
  top: 0;
  background: var(--bg-panel);
}

.data-table td {
  padding: 7px 12px;
  color: var(--text);
  border-bottom: 1px solid var(--border-divider);
}

.data-table .r  { text-align: right; }
.data-table .mono { font-family: var(--font-mono); font-size: 12.5px; }
.data-table .dim { color: var(--text-hint); font-size: 11.5px; }
.data-table .fw  { font-weight: 500; }

.st-ok  { color: var(--status-ok-text); }
.st-err { color: var(--status-err-text); }

.ev-err td { color: var(--status-err-text); }
.ev-warn td { color: var(--status-q-text); }

.empty-log {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--text-hint);
  padding: 20px 0;
  text-align: center;
}

@media (max-width: 959px) {
  .chart-grid,
  .bottom-row {
    grid-template-columns: 1fr;
  }
}
</style>
