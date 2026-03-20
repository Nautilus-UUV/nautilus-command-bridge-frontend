<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps({
  title: { default: '', type: String }
})

const title = computed(() => props.title)
</script>

<template>
  <div class="card-wrap w-100 h-100 d-flex flex-column">
    <div v-if="title" class="card-heading">{{ title }}</div>
    <div class="d-flex flex-column ga-3 h-100">
      <slot/>
    </div>
  </div>
</template>

<style scoped>
.card-wrap {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  transition: background var(--transition), border-color var(--transition);
}

.card-heading {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-divider);
}
</style>
