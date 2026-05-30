<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue"
import { useMqttBridgeStore } from "@/store/mqttBridge"
import { useTelemetryStore } from "@/store/telemetry"
import { useOverridesStore } from "@/store/overrides"

// All debug commands go MQTT-direct to the bridge, which materializes them
// into ROS messages for the bcu_debug / acu_debug nodes. std_msgs scalars
// decode from { data: <value> }; the RPM command keeps its typed shape.
const PUMP_TOPIC = 'nautilus/cmd/debug/bcu/rpm'
const PUMP_UNTIL_TOPIC = 'nautilus/cmd/debug/bcu/rpm_until_pressure'
const VALVES_TOPIC = 'nautilus/cmd/debug/bcu/valves'
const ACU_PITCH_TOPIC = 'nautilus/cmd/debug/acu/pitch'
const ACU_ROLL_TOPIC = 'nautilus/cmd/debug/acu/roll'

const mqttBridge = useMqttBridgeStore()
const overrides = useOverridesStore()
const telemetry = useTelemetryStore()
const { manualOverride } = storeToRefs(overrides)
// bcuValves drives the valve buttons + the "valve 1 closed" warning;
// bcuPressure drives both the live tank-pressure readout and the stop
// condition the new pump-until-pressure section is closing the loop on.
const { bcuValves, bcuPressure } = storeToRefs(telemetry)
const bridgeOnline = computed(() => mqttBridge.bridgeStatus === 'online')
// Debug commands are locked behind the Manual Override slider: the bridge must
// be up AND the operator must have taken manual control. Without the override
// the debug nodes stay silent and the PIDs own the actuators, so a command
// here would be dropped -- disable the controls to make that explicit.
const commandsEnabled = computed(() => bridgeOnline.value && manualOverride.value)

// --- BCU pump (RPM for X seconds) --------------------------------------
const pumpRpm = ref<number>(500)
const pumpSeconds = ref<number>(2)

function sendPump(action: 'inflate' | 'deflate') {
  // Positive RPM pumps oil INTO the bladder -> it inflates -> the glider
  // rises. Negative RPM pumps oil OUT -> deflates -> it sinks.
  const rpm = action === 'inflate' ? Math.abs(pumpRpm.value) : -Math.abs(pumpRpm.value)
  mqttBridge.publish(PUMP_TOPIC, { rpm, duration_s: pumpSeconds.value })
}

// --- BCU pump (RPM until tank pressure Y) ------------------------------
// Closed-loop sibling of the timed pump: bcu_debug runs the motor until the
// tank pressure crosses the target in the direction the RPM sign implies
// (inflate -> tank drops -> stop when <=; deflate -> tank rises -> stop
// when >=). The 30 s MAX_PUMP_S safety cap on the node side still applies.
const pumpUntilRpm = ref<number>(500)
const pumpUntilTargetPa = ref<number>(110000)

function sendPumpUntilPressure(action: 'inflate' | 'deflate') {
  const rpm = action === 'inflate'
    ? Math.abs(pumpUntilRpm.value)
    : -Math.abs(pumpUntilRpm.value)
  mqttBridge.publish(PUMP_UNTIL_TOPIC, {
    rpm,
    target_pressure_pa: Math.round(pumpUntilTargetPa.value),
  })
}

// Live tank-pressure readout for operator context (same stream the section
// is closing the loop on). Null until the first telemetry sample arrives.
const currentTankPa = computed<number | null>(() => {
  const latest = bcuPressure.value[0]?.value
  return typeof latest === 'number' ? latest : null
})

// --- BCU valves --------------------------------------------------------
// Two stateful toggles. Each click flips the effective state and publishes
// the full bitmask (bit0 = v1, bit1 = v2) -- the node owns the wire, this
// mirrors intent. Highlight + effective state come from valve1Open/valve2Open
// below, which prefer real telemetry over local intent.
const v1 = ref(false)
const v2 = ref(false)

// Opening BOTH flow paths at once is unusual and risky, so the transition
// into both-open is gated behind a confirmation pop-box. The pending target
// state is stashed until the operator confirms; everything else (closing a
// valve, opening just one) applies immediately.
const showBothValvesWarning = ref(false)
let pendingValves: { open1: boolean; open2: boolean } | null = null

function toggleValve(which: 1 | 2) {
  const next1 = which === 1 ? !valve1Open.value : valve1Open.value
  const next2 = which === 2 ? !valve2Open.value : valve2Open.value
  const alreadyBothOpen = valve1Open.value && valve2Open.value
  if (next1 && next2 && !alreadyBothOpen) {
    pendingValves = { open1: next1, open2: next2 }
    showBothValvesWarning.value = true
    return
  }
  applyValves(next1, next2)
}

function applyValves(open1: boolean, open2: boolean) {
  v1.value = open1
  v2.value = open2
  mqttBridge.publish(VALVES_TOPIC, { data: (open1 ? 1 : 0) | (open2 ? 2 : 0) })
}

function confirmBothValves() {
  if (pendingValves) applyValves(pendingValves.open1, pendingValves.open2)
  pendingValves = null
  showBothValvesWarning.value = false
}

function cancelBothValves() {
  pendingValves = null
  showBothValvesWarning.value = false
}

// Effective valve state: prefer the real telemetry value (bit0 = v1,
// bit1 = v2); fall back to local intent before the first sample arrives.
// Drives both the button highlight and the "valve 1 closed" pump warning.
const valve1Open = computed(() => {
  const latest = bcuValves.value[0]?.value
  if (typeof latest === 'number') return (latest & 1) !== 0
  return v1.value
})
const valve2Open = computed(() => {
  const latest = bcuValves.value[0]?.value
  if (typeof latest === 'number') return (latest & 2) !== 0
  return v2.value
})

// --- ACU position ------------------------------------------------------
const pitchMm = ref<number>(0)
const rollDeg = ref<number>(0)

function movePitch() {
  // ACU_PITCH wire format is Int16 millimetres.
  mqttBridge.publish(ACU_PITCH_TOPIC, { data: Math.round(pitchMm.value) })
}
function moveRoll() {
  // ACU_ROLL wire format is Int16 centidegrees (degrees * 100).
  mqttBridge.publish(ACU_ROLL_TOPIC, { data: Math.round(rollDeg.value * 100) })
}
</script>

<template>
<SimpleCardWrapper title="Debug Commands">

  <!-- Locked until the operator takes manual control via the slider above. -->
  <p v-if="bridgeOnline && !manualOverride" class="qc-locked-hint">
    <v-icon size="12" class="mr-1">mdi-lock-outline</v-icon>
    Enable Manual Override to send debug commands.
  </p>

  <!-- Grayed out + non-interactive whenever manual override is off. -->
  <div class="lock-target" :class="{ locked: !manualOverride }">

  <!-- BCU pump -->
  <div class="qc-section">
    <div class="qc-section-label">BCU Pump (RPM for X seconds)</div>
    <div class="qc-pump-inputs">
      <label class="qc-input-group">
        <span>RPM</span>
        <input type="number" v-model.number="pumpRpm" min="0" step="50" />
      </label>
      <label class="qc-input-group">
        <span>Seconds</span>
        <input type="number" v-model.number="pumpSeconds" min="0" step="0.5" />
      </label>
    </div>
    <div class="qc-row">
      <button class="qc-btn" :disabled="!commandsEnabled" @click="sendPump('inflate')">
        <v-icon size="11" class="mr-1">mdi-arrow-up-bold</v-icon>
        Pump In Bladder
      </button>
      <button class="qc-btn" :disabled="!commandsEnabled" @click="sendPump('deflate')">
        <v-icon size="11" class="mr-1">mdi-arrow-down-bold</v-icon>
        Pump Out Bladder
      </button>
    </div>
    <p v-if="!valve1Open" class="qc-warn">
      <v-icon size="12" class="mr-1">mdi-alert</v-icon>
      Valve 1 (Motor) is closed — open it before pumping so the flow has a path.
    </p>
  </div>

  <!-- BCU pump until tank pressure -->
  <div class="qc-section">
    <div class="qc-section-label">
      BCU Pump (RPM until tank pressure Y)
      <span class="qc-section-readout">
        Current: {{ currentTankPa === null ? '—' : `${currentTankPa.toFixed(0)} Pa` }}
      </span>
    </div>
    <div class="qc-pump-inputs">
      <label class="qc-input-group">
        <span>RPM</span>
        <input type="number" v-model.number="pumpUntilRpm" min="0" step="50" />
      </label>
      <label class="qc-input-group">
        <span>Tank Target (Pa)</span>
        <input type="number" v-model.number="pumpUntilTargetPa" min="0" step="1000" />
      </label>
    </div>
    <div class="qc-row">
      <button class="qc-btn" :disabled="!commandsEnabled" @click="sendPumpUntilPressure('inflate')">
        <v-icon size="11" class="mr-1">mdi-arrow-up-bold</v-icon>
        Pump In Bladder
      </button>
      <button class="qc-btn" :disabled="!commandsEnabled" @click="sendPumpUntilPressure('deflate')">
        <v-icon size="11" class="mr-1">mdi-arrow-down-bold</v-icon>
        Pump Out Bladder
      </button>
    </div>
    <p v-if="!valve1Open" class="qc-warn">
      <v-icon size="12" class="mr-1">mdi-alert</v-icon>
      Valve 1 (Motor) is closed — open it before pumping so the flow has a path.
    </p>
  </div>

  <!-- BCU valves -->
  <div class="qc-section">
    <div class="qc-section-label">BCU Valves</div>
    <div class="qc-grid qc-grid-2">
      <button class="qc-btn" :class="{ active: valve1Open }" :disabled="!commandsEnabled" @click="toggleValve(1)">
        Valve 1: Motor
      </button>
      <button class="qc-btn" :class="{ active: valve2Open }" :disabled="!commandsEnabled" @click="toggleValve(2)">
        Valve 2: Empty Pathway
      </button>
    </div>
  </div>

  <!-- ACU position -->
  <div class="qc-section">
    <div class="qc-section-label">ACU Position</div>
    <div class="qc-acu-row">
      <label class="qc-input-group qc-acu-input">
        <span>Pitch (mm)</span>
        <input type="number" v-model.number="pitchMm" step="5" />
      </label>
      <button class="qc-btn qc-acu-btn" :disabled="!commandsEnabled" @click="movePitch">
        Move pitch
      </button>
    </div>
    <div class="qc-acu-row">
      <label class="qc-input-group qc-acu-input">
        <span>Roll (deg)</span>
        <input type="number" v-model.number="rollDeg" step="1" />
      </label>
      <button class="qc-btn qc-acu-btn" :disabled="!commandsEnabled" @click="moveRoll">
        Move roll
      </button>
    </div>
  </div>

  </div>

  <!-- Both-valves-open confirmation -->
  <Teleport to="body">
    <div v-if="showBothValvesWarning" class="qc-modal-backdrop" @click.self="cancelBothValves">
      <div class="qc-modal" role="alertdialog" aria-modal="true">
        <div class="qc-modal-title">
          <v-icon size="18" class="mr-1">mdi-alert</v-icon>
          Open both valves?
        </div>
        <p class="qc-modal-body">
          This opens <strong>Valve 1 (Motor)</strong> and <strong>Valve 2 (Empty Pathway)</strong>
          at the same time, connecting both flow paths. Only do this if you know what you're doing.
        </p>
        <div class="qc-modal-actions">
          <button class="qc-btn" @click="cancelBothValves">Cancel</button>
          <button class="qc-btn qc-btn-danger" @click="confirmBothValves">Open both anyway</button>
        </div>
      </div>
    </div>
  </Teleport>

</SimpleCardWrapper>
</template>

<style scoped>
/* Mirror the card body's flex gap so wrapping the sections in .lock-target
   doesn't change their spacing. */
.lock-target { display: flex; flex-direction: column; gap: 12px; }

.qc-section { margin-bottom: 10px; }
.qc-section:last-child { margin-bottom: 0; }

.qc-locked-hint {
  display: flex;
  align-items: center;
  margin: 0 0 10px;
  padding: 6px 8px;
  font-family: var(--font-ui);
  font-size: 10.5px;
  color: var(--text-hint);
  background: var(--bg-btn);
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
}

.qc-section-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-hint);
  margin-bottom: 6px;
}

/* Optional live readout that some section labels carry on the right side --
   e.g. the tank-pressure target section shows the current tank pressure so
   the operator can pick a target without leaving the panel. */
.qc-section-readout {
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--text-btn);
}

.qc-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}
.qc-grid-2 { grid-template-columns: repeat(2, 1fr); }

.qc-row {
  display: flex;
  gap: 5px;
}

.qc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 6px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn);
  color: var(--text-btn);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
  white-space: nowrap;
  letter-spacing: 0.02em;
  flex: 1;
}
.qc-btn:hover:not(:disabled) {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.qc-btn:active:not(:disabled) { background: var(--accent-active-bg); }
.qc-btn.active {
  background: var(--accent-active-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.qc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--bg-btn);
  color: var(--text-btn);
  border-color: var(--border-btn);
}

.qc-pump-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-bottom: 6px;
}

.qc-input-group {
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-hint);
  gap: 3px;
}

.qc-input-group input {
  padding: 5px 6px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  letter-spacing: 0.02em;
}
.qc-input-group input:focus {
  outline: none;
  border-color: var(--accent-border);
}

.qc-acu-row {
  display: flex;
  align-items: flex-end;
  gap: 5px;
  margin-bottom: 6px;
}
.qc-acu-input { flex: 1; }
.qc-acu-btn { flex: 0 0 auto; }

.qc-warn {
  display: flex;
  align-items: center;
  margin: 6px 0 0;
  padding: 6px 8px;
  font-family: var(--font-ui);
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--status-q-text, #b8860b);
  background: var(--status-q-bg, rgba(255, 196, 0, 0.08));
  border: 1px solid var(--status-q-border, rgba(255, 196, 0, 0.4));
  border-radius: var(--radius-xs);
}

/* Both-valves-open confirmation pop-box */
.qc-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}
.qc-modal {
  width: min(92vw, 360px);
  padding: 16px;
  background: var(--bg-panel);
  border: 1px solid var(--status-q-border);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.3);
}
.qc-modal-title {
  display: flex;
  align-items: center;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--status-q-text);
  margin-bottom: 8px;
}
.qc-modal-body {
  margin: 0 0 14px;
  font-family: var(--font-ui);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text);
}
.qc-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.qc-modal-actions .qc-btn { flex: 0 0 auto; }
.qc-btn-danger {
  background: var(--status-err-bg);
  border-color: var(--status-err-border);
  color: var(--status-err-text);
}
.qc-btn-danger:hover:not(:disabled) {
  background: var(--status-err-bg);
  border-color: var(--status-err-text);
  color: var(--status-err-text);
}
</style>
