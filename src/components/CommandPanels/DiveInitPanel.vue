<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useMqttBridgeStore } from '@/store/mqttBridge'
import { useTelemetryStore } from '@/store/telemetry'

// Pre-dive registration: the operator types (or samples off the live
// telemetry) the tank pressure at its empty/full endpoints and the surface
// external pressure, then one Initialize button registers all three on the
// glider. The command is retained on the broker so a bridge restart replays
// it; the glider confirms what actually reached the ROS graph on
// nautilus/status/init (retained), and THAT is what this panel renders as
// "initialized" — never an optimistic local flag (same rule as the
// lifeguard toggle next door).
const INIT_CMD_TOPIC = 'nautilus/cmd/init'
const INIT_STATUS_TOPIC = 'nautilus/status/init'

interface DiveInitStatus {
  surface_pressure_pa: number
  tank_empty_pa: number
  tank_full_pa: number
}

const mqtt = useMqttBridgeStore()
const { bcuPressure, externalPressure } = storeToRefs(useTelemetryStore())

const tankEmptyPa = ref<number | null>(null)
const tankFullPa = ref<number | null>(null)
const surfacePa = ref<number | null>(null)

const registered = ref<DiveInitStatus | null>(null)
const unsubscribe = mqtt.subscribe(INIT_STATUS_TOPIC, (payload) => {
  const p = payload as Partial<DiveInitStatus>
  if (
    typeof p.surface_pressure_pa !== 'number' ||
    typeof p.tank_empty_pa !== 'number' ||
    typeof p.tank_full_pa !== 'number'
  )
    return
  registered.value = {
    surface_pressure_pa: p.surface_pressure_pa,
    tank_empty_pa: p.tank_empty_pa,
    tank_full_pa: p.tank_full_pa,
  }
  // Seed untouched inputs from the retained echo so a fresh tab shows the
  // deployed values instead of blanks. Anything the operator already typed
  // stays put.
  if (tankEmptyPa.value === null) tankEmptyPa.value = p.tank_empty_pa
  if (tankFullPa.value === null) tankFullPa.value = p.tank_full_pa
  if (surfacePa.value === null) surfacePa.value = p.surface_pressure_pa
})
onBeforeUnmount(unsubscribe)

// Live readings for the "use current" buttons. Tank endpoints sample the
// tank-pressure stream; the surface reference samples the external sensor
// (take it while the glider is actually at the surface).
const currentTankPa = computed<number | null>(() => {
  const latest = bcuPressure.value[0]?.value
  return typeof latest === 'number' ? latest : null
})
const currentExternalPa = computed<number | null>(() => {
  const latest = externalPressure.value[0]?.value
  return typeof latest === 'number' ? latest : null
})

const linkUp = computed(() => mqtt.connected && mqtt.bridgeStatus === 'online')

// The glider-side consumers treat non-positive or inverted values as "not
// registered", so don't let a nonsense triple out the door in the first place.
const valid = computed(
  () =>
    tankEmptyPa.value !== null &&
    tankFullPa.value !== null &&
    surfacePa.value !== null &&
    Number.isFinite(tankEmptyPa.value) &&
    Number.isFinite(tankFullPa.value) &&
    Number.isFinite(surfacePa.value) &&
    tankEmptyPa.value > 0 &&
    surfacePa.value > 0 &&
    tankEmptyPa.value < tankFullPa.value,
)

function initialize(): void {
  if (!linkUp.value || !valid.value) return
  mqtt.publish(
    INIT_CMD_TOPIC,
    {
      surface_pressure_pa: surfacePa.value,
      tank_empty_pa: tankEmptyPa.value,
      tank_full_pa: tankFullPa.value,
    },
    { retain: true },
  )
}
</script>

<template>
  <div class="di-panel">
    <label class="di-group" title="Tank pressure with the tank drained (bladder full)">
      <span>Tank Empty (Pa)</span>
      <span class="di-input-row">
        <input type="number" v-model.number="tankEmptyPa" min="0" step="1000" />
        <button
          class="di-cur"
          :disabled="currentTankPa === null"
          title="Use current tank pressure"
          @click="tankEmptyPa = currentTankPa"
        >
          <v-icon size="13">mdi-crosshairs-gps</v-icon>
        </button>
      </span>
    </label>

    <label class="di-group" title="Tank pressure with the tank full of oil (bladder empty)">
      <span>Tank Full (Pa)</span>
      <span class="di-input-row">
        <input type="number" v-model.number="tankFullPa" min="0" step="1000" />
        <button
          class="di-cur"
          :disabled="currentTankPa === null"
          title="Use current tank pressure"
          @click="tankFullPa = currentTankPa"
        >
          <v-icon size="13">mdi-crosshairs-gps</v-icon>
        </button>
      </span>
    </label>

    <label class="di-group" title="External pressure at the surface — sample it while the glider is actually at the surface">
      <span>Surface (Pa)</span>
      <span class="di-input-row">
        <input type="number" v-model.number="surfacePa" min="0" step="100" />
        <button
          class="di-cur"
          :disabled="currentExternalPa === null"
          title="Use current external pressure"
          @click="surfacePa = currentExternalPa"
        >
          <v-icon size="13">mdi-crosshairs-gps</v-icon>
        </button>
      </span>
    </label>

    <button
      class="di-send"
      :class="{ registered: registered !== null }"
      :disabled="!linkUp || !valid"
      :title="registered === null
        ? 'Register all three values on the glider'
        : `Registered: empty ${registered.tank_empty_pa.toFixed(0)} / full ${registered.tank_full_pa.toFixed(0)} / surface ${registered.surface_pressure_pa.toFixed(0)} Pa — press to re-register`"
      @click="initialize"
    >
      <v-icon v-if="registered !== null" size="12" class="mr-1">mdi-check</v-icon>
      {{ registered === null ? 'Initialize' : 'Initialized' }}
    </button>
  </div>
</template>

<style scoped>
.di-panel {
  position: relative; /* above the init-bar's ::before fill */
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.di-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.di-input-row {
  display: flex;
  gap: 3px;
}

.di-group input {
  width: 104px;
  min-width: 0;
  padding: 4px 6px;
  font-family: var(--font-ui);
  font-size: 12.5px;
  font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  letter-spacing: 0.02em;
}
.di-group input:focus {
  outline: none;
  border-color: var(--accent-border);
}

/* Tiny "sample the live reading" button beside each input. */
.di-cur {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition),
    color var(--transition);
}
.di-cur:hover:not(:disabled) {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.di-cur:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.di-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 27px; /* match the input row height so the bar reads as one line */
  padding: 0 14px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition), border-color var(--transition),
    color var(--transition);
}
.di-send:hover:not(:disabled) {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.di-send.registered {
  background: var(--accent-active-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.di-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
