<script setup lang="ts">
import { ref, computed } from 'vue'
import SimpleCardWrapper from '@/components/SimpleCardWrapper.vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'
import { storeToRefs } from 'pinia'

// Mission IDs come from py_pkg/path/missions/factory.py. Don't reorder
// without updating that file too -- the bridge passes mission_id straight
// through, so the dropdown index here IS the ROS dispatch key.
type MissionKey = 'trim' | 'sawtooth' | 'surface'
const MISSION_ID: Record<MissionKey, number> = {
  trim: 0,
  sawtooth: 1,
  surface: 2,
}

interface ProfileOption {
  value: MissionKey
  title: string
  hint: string
}

const profileOptions: ProfileOption[] = [
  { value: 'trim',     title: 'Trim & Neutral', hint: 'Hold a depth, zero pitch/roll. Does not self-terminate.' },
  { value: 'sawtooth', title: 'Sawtooth',       hint: 'Glide down at -pitch, up at +pitch, for N cycles.' },
  { value: 'surface',  title: 'Surface',        hint: 'Ascend to gauge 0 Pa and hold. Self-terminates.' },
]

// Source of truth is always Pa and rad -- the toggle below only changes
// how the user enters and reads them. Defaults mirror the launch-file
// canon (trim_sim:=75383 Pa ~ 7.5 m; sawtooth ~15 m at 35 deg).
const selected = ref<MissionKey>('trim')
const trimPressurePa     = ref(75383.0)
const sawPressurePa      = ref(147150.0)
const sawAngleRad        = ref(0.6109)   // ~35 deg
const sawNResurfaces     = ref(1)

const operatorUnits = ref(true)  // true = m + deg, false = Pa + rad

// Gauge-pressure conversion. Fresh-water hydrostatic; controllers operate
// in gauge so atmospheric is intentionally not added (matches the
// target_pressure_pa launch args in nautilus_hal launch files).
const PA_PER_M = 9810
const RAD_PER_DEG = Math.PI / 180

function paToM(pa: number): number { return pa / PA_PER_M }
function mToPa(m: number): number  { return m * PA_PER_M }
function radToDeg(r: number): number { return r / RAD_PER_DEG }
function degToRad(d: number): number { return d * RAD_PER_DEG }

// Round for display so the toggle doesn't show 7.500000000001-style noise.
function round(n: number, places: number): number {
  const k = 10 ** places
  return Math.round(n * k) / k
}

// v-model bridges: displayed value uses the active unit, internal storage
// is always Pa/rad. Setter parses and stores; getter formats.
const trimPressureDisplay = computed({
  get: () => operatorUnits.value
    ? round(paToM(trimPressurePa.value), 2)
    : round(trimPressurePa.value, 0),
  set: (v: number) => {
    trimPressurePa.value = operatorUnits.value ? mToPa(v) : v
  },
})

const sawPressureDisplay = computed({
  get: () => operatorUnits.value
    ? round(paToM(sawPressurePa.value), 2)
    : round(sawPressurePa.value, 0),
  set: (v: number) => {
    sawPressurePa.value = operatorUnits.value ? mToPa(v) : v
  },
})

const sawAngleDisplay = computed({
  get: () => operatorUnits.value
    ? round(radToDeg(sawAngleRad.value), 1)
    : round(sawAngleRad.value, 4),
  set: (v: number) => {
    sawAngleRad.value = operatorUnits.value ? degToRad(v) : v
  },
})

const pressureUnitLabel = computed(() => operatorUnits.value ? 'm (depth)' : 'Pa (gauge)')
const angleUnitLabel    = computed(() => operatorUnits.value ? 'deg' : 'rad')

// --- MQTT plumbing -----------------------------------------------------
const mqttStore = useMqttBridgeStore()
const { connected, bridgeStatus } = storeToRefs(mqttStore)

const statusBadge = computed(() => {
  switch (bridgeStatus.value) {
    case 'online':     return { label: 'bridge online',   tone: 'ok'   }
    case 'offline':    return { label: 'bridge offline',  tone: 'warn' }
    case 'link_lost':  return { label: 'tether lost',     tone: 'err'  }
    case 'connecting': return { label: 'connecting...',   tone: 'warn' }
  }
})

const sendDisabled = computed(() =>
  !connected.value || bridgeStatus.value !== 'online'
)

function buildMissionCommand(): { mission_id: number; target_pressure_pa: number; angle_rad: number; n_resurfaces: number } {
  const base = { mission_id: 0, target_pressure_pa: 0, angle_rad: 0, n_resurfaces: 0 }
  switch (selected.value) {
    case 'trim':
      return { ...base, mission_id: MISSION_ID.trim, target_pressure_pa: trimPressurePa.value }
    case 'sawtooth':
      return {
        ...base,
        mission_id: MISSION_ID.sawtooth,
        target_pressure_pa: sawPressurePa.value,
        angle_rad: sawAngleRad.value,
        n_resurfaces: Math.max(0, Math.floor(sawNResurfaces.value)),
      }
    case 'surface':
      return { ...base, mission_id: MISSION_ID.surface }
  }
}

function onSend() {
  if (sendDisabled.value) return
  const cmd = buildMissionCommand()
  // /path first so the pathfinder is in LOADED state before /command:start
  // arrives. They're QoS 1 so reordering is unlikely, but ordering the
  // publish calls is free insurance.
  mqttStore.publish('nautilus/cmd/path', cmd)
  mqttStore.publish('nautilus/cmd/command', { data: 'start' })
}
</script>

<template>
<SimpleCardWrapper title="Dive Profile" style="min-height: 400px">

  <!-- Header row: profile picker + unit toggle + link status -->
  <div class="header-row">
    <div class="profile-select-wrap">
      <v-select
        label="Mission profile"
        hide-details
        variant="outlined"
        density="compact"
        :items="profileOptions"
        v-model="selected"
        item-title="title"
        item-value="value"
      />
    </div>
    <button
      class="unit-toggle"
      :class="{ active: operatorUnits }"
      @click="operatorUnits = !operatorUnits"
      :title="operatorUnits ? 'Showing m / deg. Click for Pa / rad.' : 'Showing Pa / rad. Click for m / deg.'"
    >
      <v-icon size="11" class="mr-1">mdi-swap-horizontal</v-icon>
      {{ operatorUnits ? 'm / deg' : 'Pa / rad' }}
    </button>
  </div>

  <!-- Profile hint -->
  <p class="hint">{{ profileOptions.find(p => p.value === selected)?.hint }}</p>

  <!-- Parameter fields, per profile -->
  <div class="param-area flex-1-1">

    <div v-if="selected === 'trim'" class="field-grid">
      <label>
        <span class="field-label">Target depth ({{ pressureUnitLabel }})</span>
        <input type="number" v-model.number="trimPressureDisplay" :step="operatorUnits ? 0.1 : 100" />
      </label>
    </div>

    <div v-else-if="selected === 'sawtooth'" class="field-grid">
      <label>
        <span class="field-label">Target depth ({{ pressureUnitLabel }})</span>
        <input type="number" v-model.number="sawPressureDisplay" :step="operatorUnits ? 0.1 : 100" />
      </label>
      <label>
        <span class="field-label">Pitch magnitude ({{ angleUnitLabel }})</span>
        <input type="number" v-model.number="sawAngleDisplay" :step="operatorUnits ? 1 : 0.01" />
      </label>
      <label>
        <span class="field-label">Cycles</span>
        <input type="number" v-model.number="sawNResurfaces" min="0" step="1" />
      </label>
    </div>

    <div v-else class="surface-note">
      <v-icon size="20" style="color: var(--text-muted)">mdi-arrow-up-bold-outline</v-icon>
      <span>No parameters. Glider will ascend to gauge 0 Pa.</span>
    </div>

  </div>

  <!-- Footer: link status + send -->
  <div class="footer-row">
    <span class="status-badge" :class="statusBadge.tone">
      <span class="status-dot" />
      {{ statusBadge.label }}
    </span>
    <button class="nb-btn accent-btn" @click="onSend" :disabled="sendDisabled">
      <v-icon size="12" class="mr-1">mdi-send</v-icon>
      Send
    </button>
  </div>

</SimpleCardWrapper>
</template>

<style scoped>
.header-row {
  display: flex; align-items: center; gap: 8px;
}
.profile-select-wrap { flex: 1 1 0; min-width: 0; }

.unit-toggle {
  display: inline-flex; align-items: center;
  padding: 5px 10px;
  font-family: var(--font-mono); font-size: 11px; font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn); color: var(--text-muted);
  cursor: pointer; white-space: nowrap;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.unit-toggle:hover  { background: var(--accent-hover-bg); border-color: var(--accent-border); color: var(--accent); }
.unit-toggle.active { color: var(--text); }

.hint {
  font-family: var(--font-ui);
  font-size: 11.5px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 0;
}

.param-area {
  display: flex; flex-direction: column;
  min-height: 0;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.field-grid label {
  display: flex; flex-direction: column; gap: 4px;
}
.field-label {
  font-family: var(--font-ui);
  font-size: 10.5px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--text-muted);
}
.field-grid input {
  font-family: var(--font-mono); font-size: 13px;
  padding: 7px 10px;
  background: var(--bg-input, var(--bg-btn));
  color: var(--text);
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  outline: none;
  transition: border-color var(--transition);
}
.field-grid input:focus { border-color: var(--accent); }

.surface-note {
  display: flex; align-items: center; gap: 10px;
  padding: 16px;
  font-family: var(--font-ui); font-size: 12px;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius-xs);
}

.footer-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
  margin-top: auto;
}

.status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 500;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border: 1px solid;
  border-radius: 2px;
}
.status-badge.ok   { background: var(--status-ok-bg);  color: var(--status-ok-text);  border-color: var(--status-ok-border); }
.status-badge.warn { background: var(--status-q-bg);   color: var(--status-q-text);   border-color: var(--status-q-border); }
.status-badge.err  { background: var(--status-err-bg); color: var(--status-err-text); border-color: var(--status-err-border); }

.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}

.nb-btn {
  display: inline-flex; align-items: center;
  padding: 6px 14px;
  font-size: 12px; font-family: var(--font-ui); font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer; background: var(--bg-btn); color: var(--text-btn);
  transition: background var(--transition), border-color var(--transition);
  white-space: nowrap; letter-spacing: 0.02em;
}
.nb-btn:hover:not(:disabled)   { background: var(--accent-hover-bg); border-color: var(--accent-border); color: var(--accent); }
.nb-btn:active:not(:disabled)  { background: var(--accent-active-bg); }
.nb-btn:disabled               { opacity: 0.45; cursor: not-allowed; }

.accent-btn {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.accent-btn:hover:not(:disabled) { filter: brightness(1.1); color: #fff; }
</style>
