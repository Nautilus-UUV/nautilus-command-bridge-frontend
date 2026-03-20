<script setup lang="ts">
import { useSimulationStore } from '@/store/simulations'
import { storeToRefs } from 'pinia'

const simStore = useSimulationStore()
const { overlayEnabled } = storeToRefs(simStore)

// Emitted toggles — parent owns the visibility state
const props = defineProps<{
  show: {
    timestamp: boolean
    position: boolean
    orientation: boolean
    depth: boolean
    targetDepth: boolean
    hullPressure: boolean
    tankPressure: boolean
    extPressure: boolean
    leakage: boolean
    alive: boolean
  }
}>()

const emit = defineEmits<{
  (e: 'toggle', key: string): void
}>()

const displayItems: Array<{ key: string; label: string }> = [
  { key: 'timestamp',    label: 'Timestamp' },
  { key: 'position',     label: 'Position' },
  { key: 'orientation',  label: 'Orientation' },
  { key: 'depth',        label: 'Depth' },
  { key: 'targetDepth',  label: 'Target Depth' },
  { key: 'hullPressure', label: 'Hull Pressure' },
  { key: 'tankPressure', label: 'Tank Pressure' },
  { key: 'extPressure',  label: 'Ext Pressure' },
  { key: 'leakage',      label: 'Leakage' },
  { key: 'alive',        label: 'System Alive' },
]
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-title">Telemetry</div>

    <!-- Display toggles -->
    <section class="sb-panel">
      <h2>Display</h2>
      <label
        v-for="item in displayItems"
        :key="item.key"
        class="toggle-row"
      >
        <span>{{ item.label }}</span>
        <span class="switch">
          <input
            type="checkbox"
            :checked="(props.show as any)[item.key]"
            @change="emit('toggle', item.key)"
          />
          <span class="knob" />
        </span>
      </label>
    </section>

    <!-- Simulation overlay toggle -->
    <section class="sb-panel">
      <h2>Simulation</h2>
      <label class="toggle-row">
        <span>Overlay simulation</span>
        <span class="switch">
          <input type="checkbox" v-model="overlayEnabled" />
          <span class="knob" />
        </span>
      </label>
      <p class="hint">Draws simulated depth on the chart alongside live data.</p>
      <router-link to="/simulations" class="config-link">
        Configure simulation →
      </router-link>
    </section>
  </aside>
</template>

<style scoped>
/* ── Sidebar shell ─────────────────────────────────────────────────────── */
.sidebar {
  flex: 0 0 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 10px 8px;
  background: #fafafa;
  border-left: 1px solid #d0d0d0;
  height: 100%;
}

.sidebar-title {
  font-size: 13px;
  font-weight: normal;
  font-family: Georgia, serif;
  letter-spacing: 0.02em;
  border-bottom: 1px solid #ddd;
  padding-bottom: 7px;
  color: #1a1a1a;
}

/* ── Panel ─────────────────────────────────────────────────────────────── */
.sb-panel {
  border: 1px solid #e4e4e4;
  border-radius: 7px;
  padding: 9px 10px;
  background: #fff;
}

.sb-panel h2 {
  font-size: 11px;
  font-weight: normal;
  font-style: italic;
  color: #666;
  margin-bottom: 8px;
  letter-spacing: 0.04em;
  font-family: Georgia, serif;
}

/* ── Toggle rows ───────────────────────────────────────────────────────── */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 12px;
  font-family: Georgia, serif;
  cursor: pointer;
  gap: 6px;
  color: #1a1a1a;
}
.toggle-row span:first-child { flex: 1; }

/* ── Switch ────────────────────────────────────────────────────────────── */
.switch {
  position: relative; display: inline-block;
  width: 34px; height: 18px; flex-shrink: 0;
}
.switch input { opacity: 0; width: 0; height: 0; }
.knob {
  position: absolute; inset: 0;
  background: #ccc; border-radius: 18px; transition: background 0.2s;
}
.knob::before {
  content: ''; position: absolute;
  width: 12px; height: 12px; left: 3px; top: 3px;
  background: #fff; border-radius: 50%; transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.22);
}
.switch input:checked + .knob { background: #4a7fcb; }
.switch input:checked + .knob::before { transform: translateX(16px); }

/* ── Hint / link ───────────────────────────────────────────────────────── */
.hint {
  font-size: 10px;
  color: #aaa;
  font-style: italic;
  font-family: Georgia, serif;
  margin-top: 2px;
  margin-bottom: 6px;
}

.config-link {
  font-size: 11px;
  font-family: Georgia, serif;
  color: #4a7fcb;
  text-decoration: none;
}
.config-link:hover { text-decoration: underline; }
</style>
