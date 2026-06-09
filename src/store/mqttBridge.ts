// MQTT-over-WebSockets client for the operator UI.
//
// The browser talks MQTT directly to a mosquitto broker (default
// ws://localhost:9001 -- mosquitto.conf in the repo root). On the other side
// of the broker, mqtt_bridge_node.py in py_pkg translates nautilus/cmd/*
// JSON payloads into ROS messages and mirrors nautilus/telemetry/* out
// from ROS -- so this store is the *only* place in the frontend that
// knows MQTT exists.
//
// Two surfaces:
//   - publish(topic, payload)            QoS 1, commands -> bridge -> ROS
//   - subscribe(topic, handler)          QoS 0, telemetry from bridge
//
// Subscriptions are tracked in an in-memory map so they can be replayed
// on every reconnect -- the broker drops subscriptions on unclean
// disconnect, and our bridge memory note pins this resubscribe pattern.

import { defineStore } from 'pinia'
import { ref, readonly } from 'vue'
import mqtt, { type MqttClient } from 'mqtt'

export type BridgeStatus = 'connecting' | 'online' | 'offline' | 'link_lost'

export type TelemetryHandler = (payload: unknown, topic: string) => void

// Topic the bridge retains its liveness state on (mqtt_bridge_node.py).
const STATUS_TOPIC = 'nautilus/status/bridge'

// Command topics the UI publishes into (mqtt_bridge_node.py ingress).
const CMD_COMMAND = 'nautilus/cmd/command'
const CMD_PATH = 'nautilus/cmd/path'
const CMD_DEBUG_RESET = 'nautilus/cmd/debug/reset'

// Default broker URL. Override via VITE_MQTT_URL (set in .env or .env.local)
// when running against a non-localhost broker -- e.g. ws://<laptop-ip>:9001
// from a separate machine on the tethered LAN.
const BROKER_URL = import.meta.env.VITE_MQTT_URL ?? 'ws://localhost:9001'

export const useMqttBridgeStore = defineStore('mqttBridge', () => {
  const connected = ref(false)
  const bridgeStatus = ref<BridgeStatus>('connecting')

  // Random suffix so two browser tabs don't fight over the same client id
  // (paho would disconnect one of them).
  const clientId = `nautilus-ui-${crypto.randomUUID().slice(0, 8)}`

  // topic -> set of handlers. One topic may have multiple subscribers
  // (e.g. the telemetry store + a chart component peeking at the same
  // stream). The broker only sees one SUBSCRIBE per topic regardless.
  const handlers = new Map<string, Set<TelemetryHandler>>()

  const client: MqttClient = mqtt.connect(BROKER_URL, {
    clientId,
    reconnectPeriod: 2000,
    clean: true,
  })

  function resubscribeAll() {
    client.subscribe(STATUS_TOPIC, { qos: 1 }, (err) => {
      if (err) console.error('mqtt subscribe failed', STATUS_TOPIC, err)
    })
    for (const topic of handlers.keys()) {
      client.subscribe(topic, { qos: 0 }, (err) => {
        if (err) console.error('mqtt subscribe failed', topic, err)
      })
    }
  }

  client.on('connect', () => {
    connected.value = true
    resubscribeAll()
  })

  client.on('reconnect', () => {
    bridgeStatus.value = 'connecting'
  })

  client.on('close', () => {
    connected.value = false
  })

  client.on('offline', () => {
    connected.value = false
  })

  client.on('error', (err) => {
    console.error('mqtt error', err)
  })

  client.on('message', (topic, payload) => {
    if (topic === STATUS_TOPIC) {
      const text = payload.toString().trim()
      if (text === 'online' || text === 'offline' || text === 'link_lost') {
        bridgeStatus.value = text
      }
      return
    }
    const subs = handlers.get(topic)
    if (!subs || subs.size === 0) return
    let parsed: unknown
    try {
      parsed = JSON.parse(payload.toString())
    } catch (err) {
      console.error('mqtt payload parse failed', topic, err)
      return
    }
    for (const h of subs) h(parsed, topic)
  })

  // Publish a JSON message at QoS 1 (matches the ingress QoS used by the
  // bridge). Objects are stringified; strings pass through unchanged so
  // callers can also send raw JSON if they want.
  function publish(topic: string, payload: object | string): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    client.publish(topic, body, { qos: 1 }, (err) => {
      if (err) {
        console.error('mqtt publish failed', topic, err)
      }
    })
  }

  // --- mission / debug command helpers --------------------------------
  // Centralized here (the only place that knows MQTT exists) so panels don't
  // duplicate topic strings or the "stop the mission before driving an
  // actuator" sequencing. /command is std_msgs/Bool on the glider side:
  // true = start the loaded mission, false = stop + reset to a clean idle.

  // Stop the active mission and reset the stack to its clean initial state
  // (no RPM, valves closed, controllers silent). Idempotent.
  function stopMission(): void {
    publish(CMD_COMMAND, { data: false })
  }

  // Start a mission: clear any lingering manual/debug hold first (so it can't
  // fight the controllers once they drive), load the mission, then run it. The
  // leading /debug/reset also cancels an in-progress emergency surface -- an
  // accepted edge, since the emergency control is separate and prominent.
  function startMission(cmd: object): void {
    publish(CMD_DEBUG_RESET, {})
    publish(CMD_PATH, cmd)
    publish(CMD_COMMAND, { data: true })
  }

  // Run a manual/debug command: stop the active mission first so the
  // controllers go silent and don't race the debug node on the wire.
  function engageManual(run: () => void): void {
    stopMission()
    run()
  }

  // Red all-stop: stop the mission (controllers reset to safe-silent) AND
  // all-stop both debug nodes (zero RPM, close valves, neutral ACU).
  function resetAll(): void {
    stopMission()
    publish(CMD_DEBUG_RESET, {})
  }

  // Subscribe a handler to a telemetry topic. The first handler for a
  // topic triggers an MQTT SUBSCRIBE; further handlers piggy-back. The
  // returned function removes that handler (and the broker subscription
  // if it was the last one).
  function subscribe(topic: string, handler: TelemetryHandler): () => void {
    let subs = handlers.get(topic)
    if (!subs) {
      subs = new Set()
      handlers.set(topic, subs)
      if (connected.value) {
        client.subscribe(topic, { qos: 0 }, (err) => {
          if (err) console.error('mqtt subscribe failed', topic, err)
        })
      }
      // If not connected yet, resubscribeAll() in on('connect') will
      // catch it once the link comes up.
    }
    subs.add(handler)
    return () => {
      const set = handlers.get(topic)
      if (!set) return
      set.delete(handler)
      if (set.size === 0) {
        handlers.delete(topic)
        client.unsubscribe(topic, (err) => {
          if (err) console.error('mqtt unsubscribe failed', topic, err)
        })
      }
    }
  }

  return {
    connected: readonly(connected),
    bridgeStatus: readonly(bridgeStatus),
    publish,
    subscribe,
    stopMission,
    startMission,
    engageManual,
    resetAll,
  }
})
