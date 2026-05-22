<script setup lang="ts">
// Panel shell for the Commands-tab strip charts: the telemetry-style card with
// a collapse toggle in the header. Collapsed panels shrink to just their title
// bar so the operator can fold away graphs they aren't watching. The chart body
// goes in the default slot; header-right controls (Y-axis bounds) in #controls.
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{ title: string; defaultCollapsed?: boolean }>(),
  { defaultCollapsed: false },
)
const collapsed = ref(props.defaultCollapsed)
</script>

<template>
  <div class="cmd-panel" :class="{ collapsed }">
    <div class="panel-title">
      <button
        type="button"
        class="collapse-toggle"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <span class="chevron" :class="{ open: !collapsed }" aria-hidden="true"></span>
        <span>{{ title }}</span>
      </button>
      <div v-if="!collapsed" class="panel-controls">
        <slot name="controls" />
      </div>
    </div>
    <div v-if="!collapsed" class="panel-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.cmd-panel {
  flex: 0 0 auto;
  min-height: 220px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  transition: background var(--transition), border-color var(--transition);
}
/* Collapsed: drop to header height only. */
.cmd-panel.collapsed { min-height: 0; }
.cmd-panel.collapsed .panel-title { margin-bottom: 0; }

.panel-title {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  margin-bottom: 10px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* The title doubles as the collapse control. Strip button chrome so it reads
   as the heading, just clickable. */
.collapse-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
}
.collapse-toggle:hover { color: var(--text); }

.chevron {
  width: 0;
  height: 0;
  border-left: 4px solid currentColor;
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
  transition: transform 0.15s ease;
}
.chevron.open { transform: rotate(90deg); }

.panel-controls { display: flex; margin-left: auto; }

.panel-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
</style>
