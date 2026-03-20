<script setup lang="ts">
import { ref } from 'vue'
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue"
import NaivePathEditor from "@/components/CommandPanels/NaivePathEditor.vue"
import type { DiveProfileType } from '@/types/PathTypes'

const profileType = ref<DiveProfileType>('naive')
</script>

<template>
<SimpleCardWrapper title="Dive Profile" style="min-height: 400px">

  <!-- Type selector -->
  <div class="type-row flex-0-0">
    <button
      class="type-btn"
      :class="{ active: profileType === 'naive' }"
      @click="profileType = 'naive'"
    >
      Naive
    </button>
    <button
      class="type-btn"
      :class="{ active: profileType === 'sophisticated' }"
      @click="profileType = 'sophisticated'"
      title="Not yet implemented"
    >
      Sophisticated
      <span class="wip-tag">WIP</span>
    </button>
  </div>

  <!-- Naive -->
  <div v-if="profileType === 'naive'" class="flex-1-1" style="min-height:0">
    <NaivePathEditor />
  </div>

  <!-- Sophisticated placeholder -->
  <div v-else class="wip-placeholder flex-1-1">
    <v-icon size="32" style="color: var(--border)">mdi-flask-outline</v-icon>
    <p class="wip-text">Sophisticated dive profile planning is not yet implemented.</p>
    <p class="wip-hint">This mode will support advanced path optimisation, obstacle avoidance, and multi-vehicle coordination.</p>
  </div>

</SimpleCardWrapper>
</template>

<style scoped>
.type-row { display: flex; gap: 6px; }

.type-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 14px;
  font-size: 11.5px; font-family: var(--font-ui); font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer; background: var(--bg-btn); color: var(--text-muted);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.type-btn:hover  { background: var(--accent-hover-bg); border-color: var(--accent-border); color: var(--text); }
.type-btn.active { background: var(--accent-active-bg); border-color: var(--accent); color: var(--accent); }

.wip-tag {
  font-size: 8.5px; font-weight: 600; letter-spacing: 0.06em;
  background: var(--status-q-bg); color: var(--status-q-text);
  border: 1px solid var(--status-q-border);
  border-radius: 2px; padding: 1px 4px;
}

.wip-placeholder {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px; text-align: center; padding: 24px;
}
.wip-text { font-family: var(--font-ui); font-size: 13px; color: var(--text-muted); }
.wip-hint { font-family: var(--font-ui); font-size: 11px; color: var(--text-hint); max-width: 320px; line-height: 1.6; }
</style>
