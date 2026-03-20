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
import UUVViewer from '@/components/UUVViewer.vue'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Filler)

const { isDark } = useTheme()
const dataLogStore = useDataLogStore()
const { dataLogs } = storeToRefs(dataLogStore)
const { resetLeak } = dataLogStore

const simStore = useSimulationStore()
const { overlayEnabled, simDepths } = storeToRefs(simStore)

// ── Sensor visibility ──────────────────────────────────────────────────
const show = ref({
  timestamp:    true,
  position:     true,
  orientation:  true,
  depth:        true,
  targetDepth:  true,
  hullPressure: true,
  tankPressure: true,
  extPressure:  true,
  leakage:      true,
  alive:        true,
})
function togglePanel(k: string) { (show.value as any)[k] = !(show.value as any)[k] }

// Viz panel visibility
const showChart  = ref(true)
const showUUV    = ref(true)

// ── Computed sensor values ─────────────────────────────────────────────
const latestDepth       = computed(() => dataLogs.value.depths?.[0]?.depth ?? 0)
const latestTargetDepth = computed(() => dataLogs.value.targetDepths?.[0]?.depth ?? 0)
const latestPose        = computed(() => dataLogs.value.poses?.[0] ?? { x:0,y:0,z:0,qw:1,qx:0,qy:0,qz:0,record_datetime:'' })
const latestTimestamp   = computed(() => dataLogs.value.depths?.[0]?.record_datetime ?? '')
const hullPressure      = computed(() => dataLogs.value.pressures.find(p=>p.location==='hull')?.pressure ?? 0)
const extPressure       = computed(() => dataLogs.value.pressures.find(p=>p.location==='ext')?.pressure ?? 0)
const tankPressure      = computed(() => dataLogs.value.pressures.find(p=>p.location==='tank')?.pressure ?? 0)
const latestLeakage     = computed(() => dataLogs.value.leakages?.[0] ?? null)
const latestAlive       = computed(() => dataLogs.value.alives?.every(a=>a.is_alive) ?? false)

const tsFmt   = computed(() => latestTimestamp.value ? DateTime.fromISO(latestTimestamp.value,{zone:'system'}).toFormat('HH:mm:ss.SSS') : '—')
const leakFmt = computed(() => latestLeakage.value?.record_datetime ? DateTime.fromISO(latestLeakage.value.record_datetime,{zone:'system'}).toFormat('HH:mm:ss') : '—')

// ── Chart ──────────────────────────────────────────────────────────────
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

const sensorToggles = [
  { key:'timestamp',    label:'Timestamp' },
  { key:'position',     label:'Position' },
  { key:'orientation',  label:'Orientation' },
  { key:'depth',        label:'Depth' },
  { key:'targetDepth',  label:'Target Depth' },
  { key:'hullPressure', label:'Hull Pressure' },
  { key:'tankPressure', label:'Tank Pressure' },
  { key:'extPressure',  label:'Ext Pressure' },
  { key:'leakage',      label:'Leakage' },
  { key:'alive',        label:'System Alive' },
]

// Whether the sensor grid has any visible panels
const anySensor = computed(() => Object.values(show.value).some(Boolean))
</script>

<template>
  <div class="telem-root">

    <!-- ── Main scrollable area ──────────────────────────────── -->
    <div class="telem-main">

      <!-- Sensor metrics grid -->
      <div v-if="anySensor" class="sensor-section">
        <div class="sensor-grid">

          <div v-if="show.depth" class="mc mc-lg">
            <div class="mc-label">Depth</div>
            <div class="mc-value">{{ latestDepth.toFixed(2) }}</div>
            <div class="mc-unit">m</div>
          </div>

          <div v-if="show.targetDepth" class="mc mc-lg">
            <div class="mc-label">Target Depth</div>
            <div class="mc-value">{{ latestTargetDepth.toFixed(2) }}</div>
            <div class="mc-unit">m</div>
          </div>

          <div v-if="show.hullPressure" class="mc mc-md">
            <div class="mc-label">Hull Pressure</div>
            <div class="mc-value">{{ hullPressure.toFixed(3) }}</div>
            <div class="mc-unit">bar</div>
          </div>

          <div v-if="show.tankPressure" class="mc mc-md">
            <div class="mc-label">Tank Pressure</div>
            <div class="mc-value">{{ tankPressure.toFixed(3) }}</div>
            <div class="mc-unit">bar</div>
          </div>

          <div v-if="show.extPressure" class="mc mc-md">
            <div class="mc-label">Ext Pressure</div>
            <div class="mc-value">{{ extPressure.toFixed(3) }}</div>
            <div class="mc-unit">bar</div>
          </div>

          <div v-if="show.timestamp" class="mc mc-wide">
            <div class="mc-label">Timestamp</div>
            <div class="mc-value mono">{{ tsFmt }}</div>
          </div>

          <div v-if="show.position" class="mc mc-wide">
            <div class="mc-label">Position</div>
            <div class="xyz">
              <span class="xyz-k">x</span><span class="xyz-v">{{ latestPose.x.toFixed(3) }}</span>
              <span class="xyz-k">y</span><span class="xyz-v">{{ latestPose.y.toFixed(3) }}</span>
              <span class="xyz-k">z</span><span class="xyz-v">{{ latestPose.z.toFixed(3) }}</span>
            </div>
          </div>

          <div v-if="show.orientation" class="mc mc-wide">
            <div class="mc-label">Orientation</div>
            <div class="xyz">
              <span class="xyz-k">w</span><span class="xyz-v">{{ latestPose.qw.toFixed(3) }}</span>
              <span class="xyz-k">x</span><span class="xyz-v">{{ latestPose.qx.toFixed(3) }}</span>
              <span class="xyz-k">y</span><span class="xyz-v">{{ latestPose.qy.toFixed(3) }}</span>
              <span class="xyz-k">z</span><span class="xyz-v">{{ latestPose.qz.toFixed(3) }}</span>
            </div>
          </div>

          <div v-if="show.leakage" class="mc">
            <div class="mc-label">Leakage</div>
            <div class="mc-status-row">
              <span class="badge" :class="latestLeakage?.has_leak ? 'badge-err' : 'badge-ok'">
                {{ latestLeakage?.has_leak ? 'LEAK' : 'Nominal' }}
              </span>
              <span class="ts-tiny">{{ leakFmt }}</span>
              <button class="icon-act" @click="resetLeak" title="Reset">
                <v-icon size="10">mdi-refresh</v-icon>
              </button>
            </div>
          </div>

          <div v-if="show.alive" class="mc">
            <div class="mc-label">System</div>
            <div class="mc-status-row">
              <span class="alive-dot" :class="latestAlive ? 'alive-yes' : 'alive-no'" />
              <span class="mc-value small">{{ latestAlive ? 'Online' : 'Offline' }}</span>
            </div>
          </div>

        </div>
      </div>

      <!-- Viz panels — depth chart + 3D view -->
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
          <div class="panel-title">3D Attitude</div>
          <div class="viz-body">
            <UUVViewer
              :qw="latestPose.qw"
              :qx="latestPose.qx"
              :qy="latestPose.qy"
              :qz="latestPose.qz"
              :depth="latestDepth"
            />
          </div>
        </div>

      </div>

    </div>

    <!-- ── Sidebar (always open) ─────────────────────────────── -->
    <aside class="telem-sidebar">

      <div class="sb-title">Telemetry</div>

      <section class="sb-sec">
        <h2 class="sb-sec-title">Visualizations</h2>
        <label class="tog-row">
          <span class="tog-lbl">Depth Chart</span>
          <span class="sw"><input type="checkbox" v-model="showChart" /><span class="knob"/></span>
        </label>
        <label class="tog-row">
          <span class="tog-lbl">3D Attitude</span>
          <span class="sw"><input type="checkbox" v-model="showUUV" /><span class="knob"/></span>
        </label>
      </section>

      <section class="sb-sec">
        <h2 class="sb-sec-title">Sensor Panels</h2>
        <label v-for="item in sensorToggles" :key="item.key" class="tog-row">
          <span class="tog-lbl">{{ item.label }}</span>
          <span class="sw">
            <input type="checkbox" :checked="(show as any)[item.key]" @change="togglePanel(item.key)" />
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
        <router-link to="/simulations" class="cfg-link">Configure →</router-link>
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

/* ── Sensor grid ───────────────────────────────────────────────────────── */
.sensor-section { flex: 0 0 auto; }

.sensor-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Metric card base — flex-basis: 0 ensures every row (incl. last) fills 100% */
.mc {
  flex: 1 1 0;
  min-width: 90px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: background var(--transition), border-color var(--transition);
}

/* Large: Depth & Target Depth */
.mc-lg { flex: 2 1 0; min-width: 110px; padding: 14px 18px; }
.mc-lg .mc-value {
  font-family: var(--font-sub);
  font-size: 42px;
  font-weight: 200;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--metric-value);
}
.mc-lg .mc-unit { font-family: var(--font-ui); font-size: 11px; color: var(--text-hint); margin-top: 2px; letter-spacing: 0.06em; }

/* Medium: pressures */
.mc-md { flex: 1 1 0; min-width: 90px; }
.mc-md .mc-value {
  font-family: var(--font-sub);
  font-size: 28px;
  font-weight: 300;
  line-height: 1;
  color: var(--metric-value);
}
.mc-md .mc-unit { font-family: var(--font-ui); font-size: 10px; color: var(--text-hint); margin-top: 2px; }

/* Wide: timestamp, position, orientation */
.mc-wide { flex: 3 1 0; min-width: 150px; text-align: left; align-items: flex-start; }

/* Default value size */
.mc-value {
  font-family: var(--font-sub);
  font-size: 18px;
  font-weight: 400;
  color: var(--metric-value);
}
.mc-value.mono  { font-family: var(--font-mono); font-size: 13px; font-weight: 400; }
.mc-value.small { font-size: 14px; }

.mc-label {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-hint);
  margin-bottom: 6px;
}

/* xyz grid */
.xyz { display: grid; grid-template-columns: 16px 1fr; gap: 2px 5px; margin-top: 6px; }
.xyz-k { font-family: var(--font-mono); font-size: 9.5px; color: var(--text-hint); font-style: italic; padding-top: 1px; }
.xyz-v { font-family: var(--font-mono); font-size: 12px; color: var(--text); }

/* Status row inside card */
.mc-status-row { display: flex; align-items: center; gap: 7px; margin-top: 6px; }

.badge { font-size: 10px; font-weight: 600; letter-spacing: 0.06em; padding: 2px 7px; border-radius: 3px; }
.badge-err { background: var(--status-err-bg); color: var(--status-err-text); border: 1px solid var(--status-err-border); }
.badge-ok  { background: var(--status-ok-bg);  color: var(--status-ok-text);  border: 1px solid var(--status-ok-border); }

.ts-tiny { font-family: var(--font-mono); font-size: 9px; color: var(--text-hint); }

.icon-act {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px;
  border: 1px solid var(--border-btn); border-radius: 3px;
  cursor: pointer; background: var(--bg-btn); color: var(--text-muted);
  transition: background var(--transition);
}
.icon-act:hover { background: var(--accent-hover-bg); color: var(--accent); }

.alive-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.alive-yes { background: var(--alive-yes); }
.alive-no  { background: var(--alive-no); }

/* ── Viz row ───────────────────────────────────────────────────────────── */
.viz-row {
  flex: 1 1 auto;
  display: flex;
  gap: 12px;
  min-height: 320px;
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
  margin-bottom: 12px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
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

/* ── Sidebar ───────────────────────────────────────────────────────────── */
.telem-sidebar {
  flex: 0 0 230px;
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
