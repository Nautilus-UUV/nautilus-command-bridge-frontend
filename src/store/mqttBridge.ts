// MQTT-over-WebSockets client for the operator UI.
//
// The browser talks MQTT directly to a mosquitto broker (default
// ws://localhost:9001 -- mosquitto.conf in the repo root). On the other side
// of the broker, mqtt_bridge_node.py in py_pkg translates nautilus/cmd/*
// JSON payloads into ROS messages -- so this store is the *only* place in
// the frontend that knows MQTT exists.
//
// We don't subscribe to telemetry here yet (the bridge docstring explicitly
// defers egress). The only subscription right now is nautilus/status/bridge
// (retained), which lets the UI render link health and disable the Send
// button when the bridge is down.

import { defineStore } from 'pinia'
import { ref, readonly } from 'vue'
import mqtt, { type MqttClient } from 'mqtt'

export type BridgeStatus = 'connecting' | 'online' | 'offline' | 'link_lost'

// Topic the bridge retains its liveness state on (mqtt_bridge_node.py).
const STATUS_TOPIC = 'nautilus/status/bridge'

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

  const client: MqttClient = mqtt.connect(BROKER_URL, {
    clientId,
    reconnectPeriod: 2000,
    clean: true,
  })

  client.on('connect', () => {
    connected.value = true
    // Resubscribe on every reconnect -- the broker drops subscriptions on
    // unclean disconnect, and our bridge memory note says exactly this.
    client.subscribe(STATUS_TOPIC, { qos: 1 }, (err) => {
      if (err) {
        console.error('mqtt subscribe failed', STATUS_TOPIC, err)
      }
    })
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
    }
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

  return {
    connected: readonly(connected),
    bridgeStatus: readonly(bridgeStatus),
    publish,
  }
})
