// The Simpyl Database control surface.
//
// Owns the nautilus/db/* subtree -- a small command plane that the bridge never
// touches (its ingress allowlist doesn't include db/*), so everything here stays
// strictly between the UI and the local DuckDB logger.
//
//   - writerState: the logger's liveness, off nautilus/db/status (the writer
//     heartbeats it retained ~1 Hz; its last-will/clean-exit flip it to
//     'offline'). A freshness watchdog also reads 'offline' if the heartbeat
//     simply stops (broker death, no will delivered to us).
//   - start(name) / terminate(): open/close a dive via nautilus/db/cmd/control,
//     retained so a relaunched supervisor restores the desired state.
//   - sendMarker(label): drop a labelled marker (nautilus/db/cmd/marker) the
//     writer records into COMMANDS to make later analysis easier.

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'

const DB_STATUS = 'nautilus/db/status'
const DB_CONTROL = 'nautilus/db/cmd/control'
const DB_MARKER = 'nautilus/db/cmd/marker'

// Heartbeat is ~1 Hz; treat silence past this as the writer being gone.
const STALE_MS = 4000

interface DbStatus {
  state?: string
}

export const useDbWriterStore = defineStore('dbWriter', () => {
  const mqtt = useMqttBridgeStore()

  const rawOnline = ref(false)
  const lastSeenMs = ref<number | null>(null)
  const nowMs = ref(Date.now())

  mqtt.subscribe(DB_STATUS, (payload) => {
    const p = payload as DbStatus
    rawOnline.value = p?.state === 'online'
    lastSeenMs.value = Date.now()
  })

  // Drives the freshness check; 1 Hz is plenty against a ~1 Hz heartbeat.
  setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)

  // 'online' only when the writer says so AND we've heard from it recently.
  const writerState = computed<'online' | 'offline'>(() => {
    if (!rawOnline.value || lastSeenMs.value === null) return 'offline'
    return nowMs.value - lastSeenMs.value > STALE_MS ? 'offline' : 'online'
  })

  const recording = computed(() => writerState.value === 'online')

  function start(name: string): void {
    mqtt.publish(DB_CONTROL, { action: 'start', name }, { retain: true })
  }

  function terminate(): void {
    mqtt.publish(DB_CONTROL, { action: 'terminate' }, { retain: true })
  }

  function sendMarker(label: string): void {
    mqtt.publish(DB_MARKER, { label, ts: new Date().toISOString() })
  }

  return { writerState, recording, start, terminate, sendMarker }
})
