<script setup lang="ts">
import { computed } from 'vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'

// Red all-stop. One click: stop the active mission (controllers reset to a
// safe-silent state via /command=false) AND all-stop both debug nodes (zero
// RPM, close valves, neutral ACU, cancel any emergency surface) via
// /debug/reset. Fires immediately -- the operator is deliberately hitting it.
const mqtt = useMqttBridgeStore()
const bridgeOnline = computed(() => mqtt.bridgeStatus === 'online')

function onReset() {
  if (!bridgeOnline.value) return
  mqtt.resetAll()
}
</script>

<template>
  <button
    class="reset-btn"
    :disabled="!bridgeOnline"
    @click="onReset"
    title="Stop the mission and all-stop every debug actuator"
  >
    <v-icon size="13" class="mr-1">mdi-restart</v-icon>
    {{ bridgeOnline ? 'Reset' : 'bridge offline' }}
  </button>
</template>

<style scoped>
/* Deliberately understated -- this is the quiet all-stop, not the headline
   action. Ghost button in muted ink; danger intent only surfaces on hover. */
.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 30px;
  border-radius: var(--radius-xs);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.04em;
  cursor: pointer;
  color: var(--text-hint);
  background: transparent;
  border: 1px solid var(--border-btn);
  transition: background var(--transition), border-color var(--transition),
    color var(--transition);
}
.reset-btn:hover:not(:disabled) {
  color: var(--status-err-text);
  border-color: var(--status-err-border);
  background: var(--bg-btn);
}
.reset-btn:active:not(:disabled) {
  filter: brightness(0.95);
}
.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: var(--text-hint);
  background: transparent;
  border-color: var(--border-btn);
}
</style>
