<script setup lang="ts">
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDbWriterStore } from '@/store/dbWriter'
import { useMqttBridgeStore } from '@/store/mqttBridge'

// Operator controls for the local Simpyl Database logger -- a third section of
// the deploy-time init bar, twin to the lifeguard toggle and dive-init panel.
// Start opens a named dive and begins recording; Terminate closes it. The
// marker button drops a labelled annotation straight to the database (the bridge
// never sees it) to make later analysis easier.
//
// Unlike its two neighbours, none of this depends on the glider tether -- the
// writer is a laptop process. It only needs the browser's link to the broker,
// which is what carries these commands and the writer's liveness.
const db = useDbWriterStore()
const { recording } = storeToRefs(db)
const mqtt = useMqttBridgeStore()

const diveName = ref('')
const markerLabel = ref('')

const linkUp = computed(() => mqtt.connected)

function toggle(): void {
  if (!linkUp.value) return
  if (recording.value) db.terminate()
  else db.start(diveName.value.trim())
}

function dropMarker(): void {
  const label = markerLabel.value.trim()
  if (!linkUp.value || !recording.value || !label) return
  db.sendMarker(label)
  markerLabel.value = ''
}
</script>

<template>
  <div class="db-panel">
    <label class="db-group" title="A searchable name stored on this dive">
      <span>Dive Name</span>
      <input
        type="text"
        v-model="diveName"
        :disabled="recording"
        maxlength="64"
      />
    </label>

    <button
      class="db-toggle"
      :class="{ recording }"
      :disabled="!linkUp"
      :title="recording ? 'Stop recording and close the dive' : 'Open a dive and start recording'"
      @click="toggle"
    >
      <span class="db-dot" aria-hidden="true"></span>
      {{ recording ? 'Terminate DB' : 'Start DB' }}
    </button>

    <label class="db-group" title="Drop a labelled marker into the recording for later analysis">
      <span>Marker</span>
      <span class="db-input-row">
        <input
          type="text"
          v-model="markerLabel"
          :disabled="!recording"
          maxlength="64"
          @keyup.enter="dropMarker"
        />
        <button
          class="db-mark"
          :disabled="!recording || !markerLabel.trim()"
          title="Send marker"
          @click="dropMarker"
        >
          <v-icon size="13">mdi-bookmark-plus-outline</v-icon>
        </button>
      </span>
    </label>
  </div>
</template>

<style scoped>
.db-panel {
  position: relative; /* above the init-bar's ::before fill */
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 7px;
}

.db-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.db-input-row {
  display: flex;
  gap: 3px;
}

.db-group input {
  width: 96px;
  min-width: 0;
  padding: 4px 6px;
  font-family: var(--font-ui);
  font-size: 12.5px;
  font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  letter-spacing: 0.02em;
}
.db-group input:focus {
  outline: none;
  border-color: var(--accent-border);
}
.db-group input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Start / Terminate toggle -- matches the dive-init send button's footprint so
   the bar reads as one console line. */
.db-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 27px;
  padding: 0 12px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition), border-color var(--transition),
    color var(--transition);
}
.db-toggle:hover:not(:disabled) {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.db-toggle:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* Recording: ocean accent + a live dot, the same affordance the lifeguard uses
   for "armed". */
.db-toggle.recording {
  background: var(--accent-active-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.db-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--border-btn);
  transition: background var(--transition), box-shadow var(--transition);
}
.db-toggle.recording .db-dot {
  background: var(--status-ok-text);
  box-shadow: 0 0 6px var(--accent-glow);
}

.db-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-btn);
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition),
    color var(--transition);
}
.db-mark:hover:not(:disabled) {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.db-mark:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
