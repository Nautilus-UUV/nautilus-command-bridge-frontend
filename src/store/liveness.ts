// Per-subsystem health for the Link & Subsystems panel.
//
// Two sources merged:
//   - nautilus/status/liveness: the liveness node's DiagnosticArray, one entry
//     per glider subsystem. We read each entry's `message` ("online"/"offline")
//     -- NOT the numeric `level`, which doesn't survive the JSON egress as a
//     number (see TelemetryTypes.HealthState).
//   - the MQTT bridge link state (mqttBridge.bridgeStatus), surfaced as the
//     `tether` row AND used as a master gate: when the tether is not online we
//     can't trust the (possibly stale, retained) array, so the nine glider rows
//     read 'unknown'.

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'
import type {
  DiagnosticArrayMsg,
  HealthState,
  SubsystemId,
} from '@/types/TelemetryTypes'

const STATUS_LIVENESS = 'nautilus/status/liveness'

// The nine glider rows. `tether` is derived separately from the bridge link.
const GLIDER_ROWS: SubsystemId[] = [
  'acu_pitch',
  'acu_roll',
  'bcu_pump',
  'bcu_valve_1',
  'bcu_valve_2',
  'imu',
  'external_pressure',
  'tank_pressure',
]

export const useLivenessStore = defineStore('liveness', () => {
  const mqtt = useMqttBridgeStore()

  // Raw glider-row states straight off the DiagnosticArray, before gating.
  const raw = ref<Record<string, HealthState>>({})

  mqtt.subscribe(STATUS_LIVENESS, (payload) => {
    const msg = payload as DiagnosticArrayMsg
    if (!msg || !Array.isArray(msg.status)) return
    const next: Record<string, HealthState> = {}
    for (const s of msg.status) {
      next[s.name] = s.message === 'online' ? 'online' : 'offline'
    }
    raw.value = next
  })

  // Tether = the bridge link, collapsed onto the three health states.
  const tether = computed<HealthState>(() => {
    switch (mqtt.bridgeStatus) {
      case 'online':
        return 'online'
      case 'offline':
      case 'link_lost':
        return 'offline'
      default: // 'connecting'
        return 'unknown'
    }
  })

  // Master gate: only trust the glider rows while the tether is online.
  const subsystems = computed<Record<SubsystemId, HealthState>>(() => {
    const gated = tether.value !== 'online'
    const out = { tether: tether.value } as Record<SubsystemId, HealthState>
    for (const row of GLIDER_ROWS) {
      out[row] = gated ? 'unknown' : raw.value[row] ?? 'offline'
    }
    return out
  })

  return { subsystems }
})
