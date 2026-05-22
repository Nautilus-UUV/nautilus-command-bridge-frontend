<script setup lang="ts">
import { ref, computed } from 'vue'
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue"
import { sendCommand } from "@/store/commands"
import { useMqttBridgeStore } from "@/store/mqttBridge"

interface QuickCmd {
  label: string
  icon: string
  command: string
  data?: Record<string, number>
  variant?: 'default' | 'accent' | 'warn'
}

const PUMP_TOPIC = 'nautilus/cmd/debug/bcu/rpm'

const mqttBridge = useMqttBridgeStore()
const bridgeOnline = computed(() => mqttBridge.bridgeStatus === 'online')

const pumpRpm = ref<number>(500)
const pumpSeconds = ref<number>(2)

function sendPump(action: 'inflate' | 'deflate') {
  // Positive RPM pumps oil INTO the bladder -> it inflates -> more displacement
  // -> the glider rises. Negative RPM pumps oil OUT -> deflates -> sink.
  const rpm = action === 'inflate' ? Math.abs(pumpRpm.value) : -Math.abs(pumpRpm.value)
  mqttBridge.publish(PUMP_TOPIC, { rpm, duration_s: pumpSeconds.value })
}

const pitchCmds: QuickCmd[] = [
  { label: '+5°',  icon: 'mdi-rotate-right', command: 'Set_Pitch', data: { angle: 5 } },
  { label: '+10°', icon: 'mdi-rotate-right', command: 'Set_Pitch', data: { angle: 10 } },
  { label: '+20°', icon: 'mdi-rotate-right', command: 'Set_Pitch', data: { angle: 20 } },
  { label: '-5°',  icon: 'mdi-rotate-left',  command: 'Set_Pitch', data: { angle: -5 } },
  { label: '-10°', icon: 'mdi-rotate-left',  command: 'Set_Pitch', data: { angle: -10 } },
  { label: '-20°', icon: 'mdi-rotate-left',  command: 'Set_Pitch', data: { angle: -20 } },
]

function send(cmd: QuickCmd) {
  sendCommand(cmd.command as any, cmd.data ?? null)
}
</script>

<template>
<SimpleCardWrapper title="Quick Commands">

  <!-- BCU pump (debug) section -->
  <div class="qc-section">
    <div class="qc-section-label">BCU Pump (debug)</div>
    <div class="qc-pump-inputs">
      <label class="qc-input-group">
        <span>RPM</span>
        <input type="number" v-model.number="pumpRpm" min="0" step="50" />
      </label>
      <label class="qc-input-group">
        <span>Seconds</span>
        <input type="number" v-model.number="pumpSeconds" min="0" step="0.5" />
      </label>
    </div>
    <div class="qc-row">
      <button
        class="qc-btn"
        :disabled="!bridgeOnline"
        @click="sendPump('inflate')"
      >
        <v-icon size="11" class="mr-1">mdi-arrow-up-bold</v-icon>
        Pump In Bladder
      </button>
      <button
        class="qc-btn"
        :disabled="!bridgeOnline"
        @click="sendPump('deflate')"
      >
        <v-icon size="11" class="mr-1">mdi-arrow-down-bold</v-icon>
        Pump Out Bladder
      </button>
    </div>
  </div>

  <!-- Pitch section -->
  <div class="qc-section">
    <div class="qc-section-label">Pitch</div>
    <div class="qc-grid">
      <button v-for="cmd in pitchCmds" :key="cmd.label" class="qc-btn" @click="send(cmd)">
        <v-icon size="11" class="mr-1">{{ cmd.icon }}</v-icon>
        {{ cmd.label }}
      </button>
    </div>
  </div>

  <!-- Special commands -->
  <div class="qc-section">
    <div class="qc-row">
      <button class="qc-btn qc-level" @click="sendCommand('Set_Pitch' as any, { angle: 0 })">
        <v-icon size="11" class="mr-1">mdi-format-horizontal-align-center</v-icon>
        Level
      </button>
      <button class="qc-btn qc-surface" @click="sendCommand('Surface' as any)">
        <v-icon size="12" class="mr-1">mdi-arrow-up-bold</v-icon>
        SURFACE
      </button>
    </div>
  </div>

</SimpleCardWrapper>
</template>

<style scoped>
.qc-section { margin-bottom: 10px; }
.qc-section:last-child { margin-bottom: 0; }

.qc-section-label {
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-hint);
  margin-bottom: 6px;
}

.qc-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
}

.qc-row {
  display: flex;
  gap: 5px;
}

.qc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 6px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn);
  color: var(--text-btn);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
  white-space: nowrap;
  letter-spacing: 0.02em;
}
.qc-btn:hover {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.qc-btn:active { background: var(--accent-active-bg); }
.qc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: var(--bg-btn);
  color: var(--text-btn);
  border-color: var(--border-btn);
}

.qc-pump-inputs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-bottom: 6px;
}

.qc-input-group {
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-hint);
  gap: 3px;
}

.qc-input-group input {
  padding: 5px 6px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  letter-spacing: 0.02em;
}
.qc-input-group input:focus {
  outline: none;
  border-color: var(--accent-border);
}

.qc-level {
  flex: 1;
}

.qc-surface {
  flex: 1;
  font-weight: 600;
  letter-spacing: 0.08em;
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.qc-surface:hover { filter: brightness(1.1); color: #fff; }
</style>
