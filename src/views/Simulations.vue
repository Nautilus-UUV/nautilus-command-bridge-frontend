<script setup lang="ts">
import { useSimulationStore } from '@/store/simulations'
import { storeToRefs } from 'pinia'

const simStore = useSimulationStore()
const { config, isRunning, statusMessage, lastRunAt, overlayEnabled } = storeToRefs(simStore)
const { startSimulation, stopSimulation, clearSimData } = simStore

const modelOptions = [
  { value: 'constant_velocity', label: 'Constant Velocity' },
  { value: 'waypoint_following', label: 'Waypoint Following' },
  { value: 'pid_depth',          label: 'PID Depth Control' },
]
</script>

<template>
  <div class="sim-layout pa-4">

    <!-- Left: config -->
    <div class="col col-left">

      <div class="panel">
        <div class="panel-title">Simulation Model</div>
        <div class="radio-group">
          <label v-for="opt in modelOptions" :key="opt.value" class="radio-row">
            <input type="radio" :value="opt.value" v-model="config.model" />
            <span class="radio-label">{{ opt.label }}</span>
          </label>
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Parameters</div>
        <div class="param-row">
          <span class="param-label">Speed</span>
          <div class="param-right">
            <input class="num-in" type="number" min="0" step="0.1" v-model="config.speed" />
            <span class="unit">m/s</span>
          </div>
        </div>
        <div class="param-row">
          <span class="param-label">Max Depth</span>
          <div class="param-right">
            <input class="num-in" type="number" min="0" step="1" v-model="config.maxDepth" />
            <span class="unit">m</span>
          </div>
        </div>
        <div class="param-row">
          <span class="param-label">Update Rate</span>
          <div class="param-right">
            <input class="num-in" type="number" min="0.1" step="0.1" v-model="config.updateRate" />
            <span class="unit">Hz</span>
          </div>
        </div>
        <div class="param-row col-param">
          <span class="param-label">Notes</span>
          <textarea class="notes-in" v-model="config.notes" rows="3" />
        </div>
      </div>

      <div class="panel">
        <div class="panel-title">Telemetry Overlay</div>
        <label class="tog-row">
          <span class="tog-label">Show simulation on chart</span>
          <span class="sw">
            <input type="checkbox" v-model="overlayEnabled" />
            <span class="knob" />
          </span>
        </label>
        <p class="hint">Draws the simulated depth trace alongside live data on the Telemetry view.</p>
        <router-link to="/" class="cfg-link">View Telemetry →</router-link>
      </div>

    </div>

    <!-- Right: status + info -->
    <div class="col col-right">

      <div class="panel">
        <div class="panel-title">Status</div>
        <div class="status-row">
          <span class="status-dot" :class="isRunning ? 'dot-on' : 'dot-off'" />
          <span class="status-text">{{ statusMessage }}</span>
        </div>
        <div v-if="lastRunAt" class="hint mt-4">Last run: {{ lastRunAt }}</div>
      </div>

      <div class="panel">
        <div class="panel-title">Controls</div>
        <div class="btn-row">
          <button class="nb-btn accent-btn" :disabled="isRunning" @click="startSimulation">
            <v-icon size="12" class="mr-1">mdi-play</v-icon> Start
          </button>
          <button class="nb-btn" :disabled="!isRunning" @click="stopSimulation">
            <v-icon size="12" class="mr-1">mdi-stop</v-icon> Stop
          </button>
          <button class="nb-btn" @click="clearSimData">
            <v-icon size="12" class="mr-1">mdi-delete-sweep</v-icon> Clear
          </button>
        </div>
      </div>

      <div class="panel info-panel">
        <div class="panel-title">About</div>
        <p class="info-p">
          Configure a simulation model and press <em>Start</em> to run a parallel physics model
          of the UUV. When the <em>Telemetry Overlay</em> toggle is enabled, the simulated depth
          trace is drawn alongside live sensor data for direct comparison.
        </p>
        <p class="info-p">
          Simulation data is fetched from <code>/simulation/depth/load-new</code>
          (backend not yet implemented — stub mode active).
        </p>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────────────────── */
.sim-layout {
  display: flex; gap: 14px; height: 100%; overflow-y: auto;
  background: var(--bg);
}
.col { display: flex; flex-direction: column; gap: 12px; }
.col-left  { flex: 0 0 300px; }
.col-right { flex: 1 1 auto; }

/* ── Panel ───────────────────────────────────────────────────────────────── */
.panel {
  background: var(--bg-panel); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 14px 16px;
  transition: background var(--transition), border-color var(--transition);
}
.panel-title {
  font-family: var(--font-ui); font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);
  margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-divider);
}

/* ── Radio group ─────────────────────────────────────────────────────────── */
.radio-group { display: flex; flex-direction: column; gap: 8px; }
.radio-row { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.radio-row input[type=radio] { accent-color: var(--accent); width: 13px; height: 13px; }
.radio-label { font-family: var(--font-ui); font-size: 12.5px; color: var(--text); }

/* ── Params ──────────────────────────────────────────────────────────────── */
.param-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; margin-bottom: 10px;
}
.col-param { flex-direction: column; align-items: flex-start; }
.param-label { font-family: var(--font-ui); font-size: 12.5px; color: var(--text); flex: 1; }
.param-right { display: flex; align-items: center; gap: 5px; }
.unit { font-family: var(--font-ui); font-size: 10px; color: var(--text-hint); font-style: italic; }

.num-in {
  width: 76px; font-size: 12px; font-family: var(--font-mono);
  padding: 4px 6px; border: 1px solid var(--border-input);
  border-radius: var(--radius-xs); background: var(--bg-input);
  text-align: right; color: var(--text);
}
.num-in:focus { outline: none; border-color: var(--accent); }

.notes-in {
  width: 100%; font-size: 12px; font-family: var(--font-ui);
  padding: 6px 8px; border: 1px solid var(--border-input);
  border-radius: var(--radius-xs); background: var(--bg-input);
  color: var(--text); resize: vertical; margin-top: 6px;
}
.notes-in:focus { outline: none; border-color: var(--accent); }

/* ── Toggle ──────────────────────────────────────────────────────────────── */
.tog-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px; cursor: pointer; gap: 8px;
}
.tog-label { font-family: var(--font-ui); font-size: 12.5px; color: var(--text); flex: 1; }
.sw { position: relative; display: inline-block; width: 34px; height: 18px; flex-shrink: 0; }
.sw input { opacity: 0; width: 0; height: 0; }
.knob {
  position: absolute; inset: 0; background: var(--border); border-radius: 18px; transition: background 0.2s;
}
.knob::before {
  content: ''; position: absolute; width: 12px; height: 12px; left: 3px; top: 3px;
  background: #fff; border-radius: 50%; transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.22);
}
.sw input:checked + .knob { background: var(--accent); }
.sw input:checked + .knob::before { transform: translateX(16px); }

/* ── Status ──────────────────────────────────────────────────────────────── */
.status-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.status-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.dot-on  { background: var(--alive-yes); }
.dot-off { background: var(--text-hint); }
.status-text { font-family: var(--font-ui); font-size: 13px; color: var(--text); }

/* ── Buttons ─────────────────────────────────────────────────────────────── */
.btn-row { display: flex; gap: 7px; flex-wrap: wrap; }
.nb-btn {
  display: inline-flex; align-items: center;
  padding: 6px 13px; font-size: 12px; font-family: var(--font-ui); font-weight: 500;
  border: 1px solid var(--border-btn); border-radius: var(--radius-xs);
  cursor: pointer; background: var(--bg-btn); color: var(--text-btn);
  transition: background var(--transition);
}
.nb-btn:hover   { background: var(--accent-hover-bg); border-color: var(--accent-border); color: var(--accent); }
.nb-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.accent-btn { background: var(--accent); border-color: var(--accent); color: #fff; }
.accent-btn:hover { filter: brightness(1.1); color: #fff; }
.accent-btn:disabled { opacity: 0.35; }

/* ── Info ────────────────────────────────────────────────────────────────── */
.info-p { font-family: var(--font-ui); font-size: 12px; color: var(--text-muted); line-height: 1.65; margin-bottom: 8px; }
code { font-family: var(--font-mono); font-size: 10.5px; background: var(--bg-code); padding: 1px 5px; border-radius: 3px; color: var(--text); }
.hint { font-family: var(--font-ui); font-size: 10.5px; color: var(--text-hint); font-style: italic; }
.mt-4 { margin-top: 4px; }
.cfg-link { font-family: var(--font-ui); font-size: 11px; color: var(--accent); text-decoration: none; display: block; margin-top: 8px; }
.cfg-link:hover { text-decoration: underline; }
</style>
