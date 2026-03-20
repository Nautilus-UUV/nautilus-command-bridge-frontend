<script setup lang="ts">
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue"
import { sendCommand } from "@/store/commands"
import { useMissionStore } from "@/store/missions"
import { storeToRefs } from "pinia"

const missionStore = useMissionStore()
const { missions, selectedMissionId } = storeToRefs(missionStore)
const { sendCurrentMission } = missionStore
</script>

<template>
<SimpleCardWrapper title="Quick Actions">

  <div class="row-wrap">
    <v-select
      label="Dive Profile"
      hide-details
      variant="outlined"
      density="compact"
      :items="missions"
      v-model="selectedMissionId"
      item-title="name"
      item-value="mission_id"
      class="profile-select"
    />
    <button class="nb-btn accent-btn" @click="sendCurrentMission">
      <v-icon size="12" class="mr-1">mdi-briefcase-download</v-icon>
      Load to UUV
    </button>
  </div>

  <div class="row-wrap">
    <button class="nb-btn flex-1" @click="sendCommand('Start')">
      <v-icon size="12" class="mr-1">mdi-play</v-icon>
      Start
    </button>
    <button class="nb-btn flex-1" @click="sendCommand('Stop')">
      <v-icon size="12" class="mr-1">mdi-stop</v-icon>
      Stop
    </button>
  </div>

  <div class="row-wrap">
    <button class="nb-btn abort-btn" @click="sendCommand('Abort')">
      <v-icon size="14" class="mr-2">mdi-exit-run</v-icon>
      ABORT
    </button>
  </div>

</SimpleCardWrapper>
</template>

<style scoped>
.row-wrap { display: flex; align-items: center; gap: 8px; }
.flex-1   { flex: 1; justify-content: center; }

.profile-select { flex: 1 1 0; min-width: 0; }

.nb-btn {
  display: inline-flex; align-items: center;
  padding: 6px 14px;
  font-size: 12px; font-family: var(--font-ui); font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer; background: var(--bg-btn); color: var(--text-btn);
  transition: background var(--transition), border-color var(--transition);
  white-space: nowrap; letter-spacing: 0.02em;
}
.nb-btn:hover   { background: var(--accent-hover-bg); border-color: var(--accent-border); color: var(--accent); }
.nb-btn:active  { background: var(--accent-active-bg); }

.accent-btn {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.accent-btn:hover { filter: brightness(1.1); color: #fff; }

.abort-btn {
  width: 100%; justify-content: center;
  padding: 10px 20px; font-size: 13px; font-weight: 600; letter-spacing: 0.12em;
  background: var(--status-err-bg); border-color: var(--status-err-border);
  color: var(--status-err-text);
}
.abort-btn:hover { filter: brightness(0.92); }
</style>
