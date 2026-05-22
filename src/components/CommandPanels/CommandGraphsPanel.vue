<script setup lang="ts">
// Right-hand column of the Commands tab: the live BCU / ACU / depth / tank
// strip charts, stacked. These mirror the Telemetry tab exactly -- they share
// the same chart configs via useTelemetryCharts(), so an operator queueing a
// command watches the same plots they'd see on Telemetry without switching
// pages. Each graph sits in a CollapsibleChartPanel so it can be folded away.
// Replaces the old CommandHistoryPanel that used to span this column.
import {
  Chart, LineController, LineElement, PointElement,
  LinearScale, Title, CategoryScale, Tooltip, Filler, Legend,
} from 'chart.js'
import { LineChart } from 'vue-chart-3'
import CollapsibleChartPanel from '@/components/CommandPanels/CollapsibleChartPanel.vue'
import { useTelemetryCharts } from '@/composables/useTelemetryCharts'
import { useUnits } from '@/composables/useUnits'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, Tooltip, Filler, Legend)

const { pressureUnit } = useUnits()
const { bcu, acu, depth, tank } = useTelemetryCharts()

// Nested refs (bcu.yMin etc.) don't auto-unwrap in the template, so flatten
// each group to top-level bindings -- same pattern the Telemetry view uses.
const { data: bcuChartData, options: bcuChartOptions, yMin: bcuYMin, yMax: bcuYMax,
        reset: bcuReset, latestRpm, valve1Open, valve2Open } = bcu
const { data: acuChartData, options: acuChartOptions, yMin: acuYMin, yMax: acuYMax,
        reset: acuReset, pitchMmText, rollDegText } = acu
const { data: depthChartData, options: depthChartOptions, yMin: depthYMin, yMax: depthYMax,
        reset: depthReset } = depth
const { data: tankChartData, options: tankChartOptions, yMin: tankYMin, yMax: tankYMax,
        reset: tankReset, latestTankPa } = tank
</script>

<template>
  <div class="cmd-graphs">

    <!-- BCU commands (pump RPM) -->
    <CollapsibleChartPanel title="BCU Commands">
      <template #controls>
        <div class="y-axis-ctl">
          <span class="y-axis-lbl">Y</span>
          <input type="number" v-model.number="bcuYMin" placeholder="min" title="RPM Y-axis min. Leave empty for auto." />
          <input type="number" v-model.number="bcuYMax" placeholder="max" title="RPM Y-axis max. Leave empty for auto." />
          <button class="vt-btn" @click="bcuReset" title="Clear bounds, return to auto-scale">auto</button>
        </div>
      </template>
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
    </CollapsibleChartPanel>

    <!-- ACU commands (pitch mm + roll deg) -->
    <CollapsibleChartPanel title="ACU Commands">
      <template #controls>
        <div class="y-axis-ctl">
          <span class="y-axis-lbl">Y</span>
          <input type="number" v-model.number="acuYMin" placeholder="min" title="Pitch Y-axis min (mm). Leave empty for auto." />
          <input type="number" v-model.number="acuYMax" placeholder="max" title="Pitch Y-axis max (mm). Leave empty for auto." />
          <button class="vt-btn" @click="acuReset" title="Clear bounds, return to auto-scale">auto</button>
        </div>
      </template>
      <div class="kv-grid">
        <div class="kv-key">Pitch</div>
        <div class="kv-val mono">{{ pitchMmText }}</div>
        <div class="kv-key">Roll</div>
        <div class="kv-val mono">{{ rollDegText }}</div>
      </div>
      <div class="strip-body">
        <LineChart :chartData="acuChartData" :options="acuChartOptions" style="width:100%;height:100%" />
      </div>
    </CollapsibleChartPanel>

    <!-- Depth over time (pressure-derived, tracks the AppBar Pa/m toggle) -->
    <CollapsibleChartPanel title="Depth over Time">
      <template #controls>
        <div class="y-axis-ctl">
          <span class="y-axis-lbl">Y</span>
          <input type="number" v-model.number="depthYMin" placeholder="min" :title="`Y-axis min (${pressureUnit}). Leave empty for auto.`" />
          <input type="number" v-model.number="depthYMax" placeholder="max" :title="`Y-axis max (${pressureUnit}). Leave empty for auto.`" />
          <button class="vt-btn" @click="depthReset" title="Clear bounds, return to auto-scale">auto</button>
        </div>
      </template>
      <div class="strip-body">
        <LineChart :chartData="depthChartData" :options="depthChartOptions" style="width:100%;height:100%" />
      </div>
    </CollapsibleChartPanel>

    <!-- Tank pressure (internal bladder, absolute Pa) -->
    <CollapsibleChartPanel title="Tank Pressure">
      <template #controls>
        <div class="y-axis-ctl">
          <span class="y-axis-lbl">Y</span>
          <input type="number" v-model.number="tankYMin" placeholder="min" title="Tank Y-axis min (Pa). Leave empty for auto." />
          <input type="number" v-model.number="tankYMax" placeholder="max" title="Tank Y-axis max (Pa). Leave empty for auto." />
          <button class="vt-btn" @click="tankReset" title="Clear bounds, return to auto-scale">auto</button>
        </div>
      </template>
      <div class="kv-grid">
        <div class="kv-key">Tank</div>
        <div class="kv-val mono">{{ latestTankPa !== null ? Math.round(latestTankPa) + ' Pa' : '—' }}</div>
      </div>
      <div class="strip-body">
        <LineChart :chartData="tankChartData" :options="tankChartOptions" style="width:100%;height:100%" />
      </div>
    </CollapsibleChartPanel>

  </div>
</template>

<style scoped>
/* Vertical stack; scrolls when the column is shorter than the open graphs.
   The panel shell + collapse chrome live in CollapsibleChartPanel; the styles
   below dress the slotted content (readouts, Y-axis controls, chart body). */
.cmd-graphs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow-y: auto;
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
  color: var(--text-hint);
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.kv-val { color: var(--text); }
.kv-val.mono { font-family: var(--font-mono); font-size: 12.5px; }

.strip-body {
  flex: 1 1 auto;
  min-height: 120px;
  margin-top: 10px;
  position: relative;
}

/* ── Y-axis manual-bounds control (matches Charts.vue) ─────────────────── */
.y-axis-ctl {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.y-axis-lbl {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
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
.y-axis-ctl input::-webkit-outer-spin-button,
.y-axis-ctl input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.y-axis-ctl input[type=number] { -moz-appearance: textfield; }

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
  transition: background var(--transition), color var(--transition);
}
.vt-btn:hover { background: var(--accent-hover-bg); color: var(--text-muted); }

/* ── Valve LEDs (matches Charts.vue) ───────────────────────────────────── */
.valve-led {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10.5px;
  font-weight: 600;
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
</style>
