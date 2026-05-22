<script setup lang="ts">
import CommandBtnPanel from "@/components/CommandPanels/CommandBtnPanel.vue";
import QuickCommandPanel from "@/components/CommandPanels/QuickCommandPanel.vue";
import CommandGraphsPanel from "@/components/CommandPanels/CommandGraphsPanel.vue";
import CommandProfilePanel from "@/components/CommandPanels/CommandProfilePanel.vue";
</script>

<template>
  <div class="command-grid pa-3">
    <div class="command-btns">
      <CommandBtnPanel/>
    </div>
    <div class="command-quick">
      <QuickCommandPanel/>
    </div>
    <div class="command-profiles">
      <CommandProfilePanel/>
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
  grid-template-rows: auto auto 1fr;
  grid-column-gap: 10px;
  grid-row-gap: 10px;
  height: 100%;
  width: 100%;
}

.command-btns     { grid-area: 1 / 1 / 2 / 2; }
.command-quick    { grid-area: 2 / 1 / 3 / 2; }
.command-profiles { grid-area: 3 / 1 / 4 / 2; }
.command-graphs   { grid-area: 1 / 2 / 4 / 3; min-height: 0; }

@media (max-width: 959px) {
  .command-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .command-btns,
  .command-quick,
  .command-profiles {
    height: 50vh;
  }

  .command-graphs {
    height: 100vh;
  }
}
</style>
