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
    <v-icon size="18" class="mr-2">mdi-restart</v-icon>
    {{ bridgeOnline ? 'Reset' : 'bridge offline' }}
  </button>
</template>

<style scoped>
.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 44px;
  border-radius: 6px;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  color: var(--status-err-text, #dc2626);
  background: var(--status-err-bg, rgba(220, 38, 38, 0.12));
  border: 1px solid var(--status-err-border, rgba(220, 38, 38, 0.5));
  transition: background var(--transition), border-color var(--transition),
    color var(--transition);
}
.reset-btn:hover:not(:disabled) {
  background: var(--status-err-border, rgba(220, 38, 38, 0.5));
  border-color: var(--status-err-text, #dc2626);
  color: #fff;
}
.reset-btn:active:not(:disabled) {
  filter: brightness(0.95);
}
.reset-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  color: var(--text-hint);
  background: var(--bg-btn);
  border-color: var(--border-btn);
}
</style>
