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
import { ref, readonly, computed } from 'vue'
import mqtt, { type MqttClient } from 'mqtt'
import type { MissionCommandMsg } from '@/types/TelemetryTypes'

export type BridgeStatus = 'connecting' | 'online' | 'offline' | 'link_lost'

export type TelemetryHandler = (payload: unknown, topic: string) => void

// Topic the bridge retains its liveness state on (mqtt_bridge_node.py).
const STATUS_TOPIC = 'nautilus/status/bridge'

// The bridge's app-level liveness beat (mqtt_bridge_node.py, every 2 s). We
// watch its freshness so a tether drop shows here in ~3.5 s, instead of waiting
// out the broker's keepalive timeout (~30-45 s) for the retained link_lost.
const STATUS_TICK_TOPIC = 'nautilus/status/bridge/tick'

// Treat the tick as silent past this and call the link lost locally. ~1.75
// missed 2 s beats: aggressive but tolerant of a single dropped QoS-0 beat, and
// non-latching -- it clears the instant a beat returns, so a flaky tether just
// flickers rather than sticking.
const TICK_STALE_MS = 3500

// Command topics the UI publishes into (mqtt_bridge_node.py ingress).
const CMD_COMMAND = 'nautilus/cmd/command'
const CMD_PATH = 'nautilus/cmd/path'
const CMD_DEBUG_RESET = 'nautilus/cmd/debug/reset'

// Operator-presence heartbeat for the glider's lifeguard failsafe. Consumed
// by the bridge itself (never forwarded to ROS): once the lifeguard is armed,
// heartbeat silence past its window makes the glider blow ballast and surface.
const CMD_HEARTBEAT = 'nautilus/cmd/heartbeat'

// Default broker URL. Override via VITE_MQTT_URL (set in .env or .env.local)
// when running against a non-localhost broker -- e.g. ws://<laptop-ip>:9001
// from a separate machine on the tethered LAN.
const BROKER_URL = import.meta.env.VITE_MQTT_URL ?? 'ws://localhost:9001'

export const useMqttBridgeStore = defineStore('mqttBridge', () => {
  const connected = ref(false)
  // Raw link state from the broker: our own reconnects plus the retained
  // nautilus/status/bridge value. bridgeStatus below folds tick-freshness in.
  const rawBridgeStatus = ref<BridgeStatus>('connecting')
  // When we last heard the bridge tick (seeded on going online; see below).
  const lastTickMs = ref<number | null>(null)
  const nowMs = ref(Date.now())

  // Effective link health: an 'online' raw state is downgraded to 'link_lost'
  // the moment the tick goes stale, so a tether drop surfaces in ~3.5 s. Every
  // other raw state (connecting/offline/link_lost) passes through unchanged.
  const bridgeStatus = computed<BridgeStatus>(() => {
    if (rawBridgeStatus.value !== 'online') return rawBridgeStatus.value
    if (lastTickMs.value === null) return 'link_lost'
    return nowMs.value - lastTickMs.value > TICK_STALE_MS ? 'link_lost' : 'online'
  })

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
    client.subscribe(STATUS_TICK_TOPIC, { qos: 0 }, (err) => {
      if (err) console.error('mqtt subscribe failed', STATUS_TICK_TOPIC, err)
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
    rawBridgeStatus.value = 'connecting'
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

  // 1 Hz heartbeat, QoS 0 and never retained -- a retained beat would replay
  // on bridge reconnect as one fake-fresh sign of life. Runs for the app's
  // lifetime: any open console means "operator present", which is exactly
  // the signal the lifeguard keys on.
  setInterval(() => {
    if (connected.value) client.publish(CMD_HEARTBEAT, '{}', { qos: 0 })
  }, 1000)

  // Drives the tick-freshness check in bridgeStatus; 1 Hz against a 2 s beat is
  // plenty.
  setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)

  client.on('message', (topic, payload) => {
    if (topic === STATUS_TICK_TOPIC) {
      lastTickMs.value = Date.now()
      return
    }
    if (topic === STATUS_TOPIC) {
      const text = payload.toString().trim()
      if (text === 'online' || text === 'offline' || text === 'link_lost') {
        rawBridgeStatus.value = text
        // Seed the tick clock on going online so a healthy (re)connect doesn't
        // flash link_lost before its first tick arrives. If the bridge is
        // actually gone (we joined onto a stale-retained 'online'), no ticks
        // follow and bridgeStatus flips to link_lost in ~3.5 s.
        if (text === 'online') lastTickMs.value = Date.now()
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
  // callers can also send raw JSON if they want. `retain` is for state-like
  // commands (the lifeguard arm) that must survive a bridge reconnect.
  function publish(
    topic: string,
    payload: object | string,
    opts?: { retain?: boolean },
  ): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    client.publish(topic, body, { qos: 1, retain: opts?.retain ?? false }, (err) => {
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
  // `cmd` is typed rather than `object` on purpose: the bridge drops the whole
  // /path command on any key that isn't a MissionCommand field, so this is the
  // only compile-time check standing between a renamed field and a mission
  // that silently never starts.
  function startMission(cmd: MissionCommandMsg): void {
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
    bridgeStatus,
    lastTickMs: readonly(lastTickMs),
    publish,
    subscribe,
    stopMission,
    startMission,
    engageManual,
    resetAll,
  }
})
