// Operator manual-override state -- the single source of UI truth for
// "manual mode". The slider (ManualOverrideSlider.vue) and the emergency
// button write here; the Debug Commands and Dive Profile panels read here.
//
// Entering manual mode publishes BOTH override flags through the MQTT bridge
// (manual_override gates the BCU/depth loop, acu_override the ACU loop). The
// PID nodes stand down while their flag is True and the debug nodes drive the
// wire only while it is True -- so one slider hands the whole vehicle between
// autonomous and manual control.
//
// We also subscribe to the retained telemetry mirror of manual_override so
// the slider reflects the true ROS state on load / reconnect and after the
// emergency button auto-enables it. Local state is set optimistically on
// publish; the mirror reconciles it.

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'

// Ingress (UI -> bridge -> ROS). Must match INGRESS_MAP in
// py_pkg/mqtt/mqtt_bridge_node.py.
const CMD_MANUAL_OVERRIDE = 'nautilus/cmd/control/manual_override'
const CMD_ACU_OVERRIDE = 'nautilus/cmd/control/acu_override'
// Egress mirror (ROS -> bridge -> UI), retained. The BCU flag is canonical
// for display since both move together from this UI.
const TELEMETRY_MANUAL_OVERRIDE = 'nautilus/telemetry/control/manual_override'

export const useOverridesStore = defineStore('overrides', () => {
  const mqtt = useMqttBridgeStore()

  const manualOverride = ref(false)

  // Reconcile from the retained ROS state. Payload is a std_msgs/Bool ->
  // { data: boolean }.
  mqtt.subscribe(TELEMETRY_MANUAL_OVERRIDE, (payload) => {
    const msg = payload as { data?: boolean }
    if (typeof msg?.data === 'boolean') manualOverride.value = msg.data
  })

  // Enter (true) or leave (false) manual mode. Raises both loops together so
  // the BCU and ACU PIDs lock/unlock as one.
  function setManualOverride(on: boolean): void {
    manualOverride.value = on
    mqtt.publish(CMD_MANUAL_OVERRIDE, { data: on })
    mqtt.publish(CMD_ACU_OVERRIDE, { data: on })
  }

  return {
    manualOverride,
    setManualOverride,
  }
})
