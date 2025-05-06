<script setup lang="ts">
import CommandBtnPanel from "@/components/CommandPanels/CommandBtnPanel.vue";
import CommandHistoryPanel from "@/components/CommandPanels/CommandHistoryPanel.vue";
import CommandProfilePanel from "@/components/CommandPanels/CommandProfilePanel.vue";
</script>

<template>
  <div
    class="command-grid h-100 w-100 pa-3 pa-md-4"
  >
    <div
      class="command-btns"
    >
      <CommandBtnPanel/>
    </div>
    <div
      class="command-profiles"
    >
      <CommandProfilePanel/>
    </div>
    <div
      class="command-history"
    >
      <CommandHistoryPanel/>
    </div>
  </div>
</template>

<style scoped>
.command-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  grid-column-gap: 16px;
  grid-row-gap: 16px;
}

.command-btns { grid-area: 1 / 1 / 2 / 2; }
.command-profiles { grid-area: 2 / 1 / 3 / 2; }
.command-history { grid-area: 1 / 2 / 3 / 3; }

/* Responsive layout for screens below 960px */
@media (max-width: 959px) {
  .command-grid {
    display: flex;
    flex-direction: column;
    grid-column-gap: 12px;
    grid-row-gap: 12px;
  }

  .command-btns,
  .command-profiles {
    height: 50vh;
  }

  .command-history {
    height: 100vh;
  }
}
</style>
