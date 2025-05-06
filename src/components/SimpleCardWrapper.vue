<script setup lang="ts">
import {computed} from "vue";

const props = defineProps({
  title: {
    default: '',
    type: String
  }
})

const title = computed(() => props.title)
</script>

<template>
  <v-card
    class="w-100 h-100 px-4 py-3 d-flex flex-column"
  >
    <v-card-title
      v-if="title"
      class="text-h5 pa-0"
    >
      {{ title }}
    </v-card-title>
    <div
      class="d-flex flex-column ga-4 h-100"
    >
      <slot/>
    </div>
  </v-card>
</template>

<style scoped>

</style>
