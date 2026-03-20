<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue"
import { sendCommand } from "@/store/commands"
import { useMissionStore } from "@/store/missions"
import { usePathStore } from "@/store/path"
import { storeToRefs } from "pinia"

const missionStore = useMissionStore()
const { missions } = storeToRefs(missionStore)

const pathStore = usePathStore()
const { segments } = storeToRefs(pathStore)

// Unified item type for the dropdown
interface ProfileItem {
  id: string
  name: string
  kind: 'mission' | 'segment'
}

const profileItems = computed<ProfileItem[]>(() => [
  ...missions.value.map(m => ({ id: m.mission_id, name: m.name, kind: 'mission' as const })),
  ...segments.value.map(s => ({ id: s.segment_id, name: s.name, kind: 'segment' as const })),
])

const selectedProfileId = ref<string | null>(
  missions.value[0]?.mission_id ?? segments.value[0]?.segment_id ?? null
)

// Auto-select first item once profiles load (missions arrive async from backend)
watch(profileItems, (items) => {
  if (!selectedProfileId.value && items.length > 0) {
    selectedProfileId.value = items[0].id
  }
}, { immediate: false })

function loadToUUV() {
  const item = profileItems.value.find(p => p.id === selectedProfileId.value)
  if (!item) return

  if (item.kind === 'mission') {
    missionStore.selectedMissionId = item.id
    missionStore.sendCurrentMission()
  } else {
    const seg = segments.value.find(s => s.segment_id === item.id)
    if (!seg) return
    sendCommand('Mission_Profile', {
      name: seg.name,
      waypoints: seg.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
    })
  }
}
</script>

<template>
<SimpleCardWrapper title="Quick Actions">

  <div class="row-wrap">
    <v-select
      label="Dive Profile"
      hide-details
      variant="outlined"
      density="compact"
      :items="profileItems"
      v-model="selectedProfileId"
      item-title="name"
      item-value="id"
      class="profile-select"
    >
      <template #item="{ item: vItem, props: vProps }">
        <v-list-item v-bind="vProps">
          <template #append>
            <span class="kind-tag" :class="vItem.raw.kind">{{ vItem.raw.kind === 'mission' ? 'server' : 'local' }}</span>
          </template>
        </v-list-item>
      </template>
    </v-select>
    <button class="nb-btn accent-btn" @click="loadToUUV" :disabled="!selectedProfileId">
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

.kind-tag {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: 2px;
  border: 1px solid;
}
.kind-tag.mission {
  background: var(--status-ok-bg);
  color: var(--status-ok-text);
  border-color: var(--status-ok-border);
}
.kind-tag.segment {
  background: var(--accent-light);
  color: var(--accent);
  border-color: var(--accent-border);
}

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
