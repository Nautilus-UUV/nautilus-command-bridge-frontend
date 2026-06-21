// Live telemetry from mqtt_bridge_node.py. Replaces the polling path
// the old datalogs store used (which targeted a FastAPI backend that
// does not exist in this workspace -- see frontend_claude.md).
//
// Each ROS topic from EGRESS_MAP in py_pkg/mqtt/mqtt_bridge_node.py
// has a ring buffer here. Most are capped at 600 samples (~2 min at
// 5 Hz, enough for the strip charts on the Telemetry tab); state-like
// streams that don't get charted are capped lower.
//
// Subscription lifecycle is tied to the store's first use: pinia
// instantiates the store lazily, so the subscribe() calls fire once
// per page session.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'
import type {
  ImuMsg,
  MissionActiveMsg,
  PoseMsg,
  Sample,
  ScalarMsg,
  TemperatureMsg,
} from '@/types/TelemetryTypes'

const CAP_CHARTED = 600
const CAP_STATE = 100
const CAP_TIMELINE = 50

function nowIso(): string {
  return new Date().toISOString()
}

// All streams use client receive time for recordDatetime. The ROS
// header stamp on Imu/Pose carries sim or node-uptime, not wall clock,
// so it can't drive a "Last Updated" display -- using it landed the IMU
// rows at 1970-01-01T00:01:07 once sim time was ~67s.

function pushCapped<T>(buf: T[], v: T, cap: number): void {
  buf.unshift(v)
  if (buf.length > cap) buf.length = cap
}

export const useTelemetryStore = defineStore('telemetry', () => {
  const mqtt = useMqttBridgeStore()

  const position = ref<Sample<PoseMsg>[]>([])
  const positionTarget = ref<Sample<PoseMsg>[]>([])
  const imu = ref<Sample<ImuMsg>[]>([])
  const bcuPressure = ref<Sample<number>[]>([])
  const externalPressure = ref<Sample<number>[]>([])
  const externalTemperature = ref<Sample<number>[]>([])
  const bcuRpm = ref<Sample<number>[]>([])
  const bcuFeedbackRpm = ref<Sample<number>[]>([])
  const bcuValves = ref<Sample<number>[]>([])
  const acuPitch = ref<Sample<number>[]>([])
  const acuRoll = ref<Sample<number>[]>([])
  const missionActive = ref<Sample<MissionActiveMsg>[]>([])

  // The surface pressure the operator registered pre-dive, echoed (retained)
  // on nautilus/status/init -- the gauge reference the glider's controllers
  // convert against (physics.py::SurfaceReference). Held as a single scalar
  // (not a charted ring buffer): null until a registration arrives, at which
  // point depth readouts re-reference to it. DiveInitPanel piggy-backs the
  // same broker subscription for the full init triple.
  const surfaceReferencePa = ref<number | null>(null)

  function bindScalar(
    topic: string,
    target: { value: Sample<number>[] },
    cap: number,
  ) {
    mqtt.subscribe(topic, (payload) => {
      const msg = payload as ScalarMsg
      if (typeof msg?.data !== 'number') return
      pushCapped(target.value, { recordDatetime: nowIso(), value: msg.data }, cap)
    })
  }

  function bindPose(
    topic: string,
    target: { value: Sample<PoseMsg>[] },
    cap: number,
  ) {
    mqtt.subscribe(topic, (payload) => {
      const msg = payload as PoseMsg
      if (!msg?.position || !msg?.orientation) return
      pushCapped(target.value, { recordDatetime: nowIso(), value: msg }, cap)
    })
  }

  function bindImu(
    topic: string,
    target: { value: Sample<ImuMsg>[] },
    cap: number,
  ) {
    mqtt.subscribe(topic, (payload) => {
      const msg = payload as ImuMsg
      if (!msg?.linear_acceleration) return
      pushCapped(target.value, { recordDatetime: nowIso(), value: msg }, cap)
    })
  }

  // sensor_msgs/Temperature carries the reading in `temperature` (Celsius), not
  // the std_msgs `.data` that bindScalar reads -- hence its own binder.
  function bindTemperature(
    topic: string,
    target: { value: Sample<number>[] },
    cap: number,
  ) {
    mqtt.subscribe(topic, (payload) => {
      const msg = payload as TemperatureMsg
      if (typeof msg?.temperature !== 'number') return
      pushCapped(
        target.value,
        { recordDatetime: nowIso(), value: msg.temperature },
        cap,
      )
    })
  }

  // --- subscriptions ----------------------------------------------------
  // Topic names must match EGRESS_MAP in py_pkg/mqtt/mqtt_bridge_node.py.
  bindPose('nautilus/telemetry/position/estimation', position, CAP_CHARTED)
  bindPose('nautilus/telemetry/position/target', positionTarget, CAP_STATE)
  bindImu('nautilus/telemetry/imu', imu, CAP_CHARTED)
  bindScalar('nautilus/telemetry/bcu/pressure', bcuPressure, CAP_CHARTED)
  bindScalar('nautilus/telemetry/external/pressure', externalPressure, CAP_CHARTED)
  bindTemperature(
    'nautilus/telemetry/external/temperature',
    externalTemperature,
    CAP_CHARTED,
  )
  bindScalar('nautilus/telemetry/bcu/rpm', bcuRpm, CAP_CHARTED)
  bindScalar('nautilus/telemetry/bcu/feedback/rpm', bcuFeedbackRpm, CAP_CHARTED)
  bindScalar('nautilus/telemetry/bcu/valves', bcuValves, CAP_STATE)
  bindScalar('nautilus/telemetry/acu/pitch', acuPitch, CAP_CHARTED)
  bindScalar('nautilus/telemetry/acu/roll', acuRoll, CAP_CHARTED)

  mqtt.subscribe('nautilus/telemetry/mission/active', (payload) => {
    const msg = payload as MissionActiveMsg
    if (!msg?.state) return
    pushCapped(
      missionActive.value,
      { recordDatetime: nowIso(), value: msg },
      CAP_TIMELINE,
    )
  })

  // Adopt the registered surface only when it's a finite positive number --
  // mirrors SurfaceReference.register's non-positive rejection so a
  // partially-filled init (missing fields decode to 0.0) can't shift the whole
  // gauge frame by ~101 kPa.
  mqtt.subscribe('nautilus/status/init', (payload) => {
    const p = payload as { surface_pressure_pa?: unknown }
    const surface = p?.surface_pressure_pa
    if (typeof surface === 'number' && Number.isFinite(surface) && surface > 0) {
      surfaceReferencePa.value = surface
    }
  })

  return {
    position,
    positionTarget,
    imu,
    bcuPressure,
    externalPressure,
    externalTemperature,
    bcuRpm,
    bcuFeedbackRpm,
    bcuValves,
    acuPitch,
    acuRoll,
    missionActive,
    surfaceReferencePa,
  }
})
