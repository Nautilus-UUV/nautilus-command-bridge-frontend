<script setup lang="ts">
import EmergencySurfaceButton from "@/components/CommandPanels/EmergencySurfaceButton.vue";
import ResetButton from "@/components/CommandPanels/ResetButton.vue";
import DebugCommandsPanel from "@/components/CommandPanels/DebugCommandsPanel.vue";
import CommandGraphsPanel from "@/components/CommandPanels/CommandGraphsPanel.vue";
import CommandProfilePanel from "@/components/CommandPanels/CommandProfilePanel.vue";
import SubsystemHealthPanel from "@/components/CommandPanels/SubsystemHealthPanel.vue";
</script>

<template>
  <div class="command-grid pa-3">
    <div class="command-emergency">
      <EmergencySurfaceButton/>
      <ResetButton/>
    </div>
    <div class="command-debug">
      <DebugCommandsPanel/>
    </div>
    <div class="command-profiles">
      <CommandProfilePanel/>
    </div>
    <div class="command-health">
      <SubsystemHealthPanel/>
    </div>
    <div class="command-graphs">
      <CommandGraphsPanel/>
    </div>
  </div>
</template>

<style scoped>
.command-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  /* Left column sizes emergency/debug/profiles/health to their content; the
     trailing 1fr row absorbs the slack so those cards hug their content
     instead of stretching the full page. The graphs column spans all five
     rows to stay full-height. */
  grid-template-rows: auto auto auto auto 1fr;
  grid-column-gap: 10px;
  grid-row-gap: 10px;
  height: 100%;
  width: 100%;
}

.command-emergency { grid-area: 1 / 1 / 2 / 2; display: flex; flex-direction: column; gap: 10px; }
.command-debug     { grid-area: 2 / 1 / 3 / 2; display: flex; flex-direction: column; gap: 10px; }
.command-profiles  { grid-area: 3 / 1 / 4 / 2; }
.command-health    { grid-area: 4 / 1 / 5 / 2; }
.command-graphs    { grid-area: 1 / 2 / 6 / 3; min-height: 0; }

@media (max-width: 959px) {
  .command-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .command-debug,
  .command-profiles {
    height: 50vh;
  }

  .command-graphs {
    height: 100vh;
  }
}
</style>
