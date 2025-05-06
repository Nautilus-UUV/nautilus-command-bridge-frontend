<script setup lang="ts">
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue";
</script>

<template>
<SimpleCardWrapper
  title="Quick Actions"
>
  <div
    class="d-flex justify-center align-center ga-4"
  >
    <v-select
      label="Dive Profile Selection"
      hide-details
      max-width="400"
    />
    <v-btn
      prepend-icon="mdi-briefcase-download"
      color="primary"
    >
      Load To UUV
    </v-btn>
  </div>
  <div
    class="d-flex justify-center ga-4"
  >
    <v-btn
      variant="outlined"
      prepend-icon="mdi-play"
    >
      Start
    </v-btn>
    <v-btn
      variant="outlined"
      prepend-icon="mdi-pause"
    >
      Pause
    </v-btn>
  </div>
  <div
    class="d-flex justify-center ga-4"
  >
    <v-btn
      color="error"
      prepend-icon="mdi-exit-run"
      size="x-large"
    >
      ABORT
    </v-btn>
  </div>
</SimpleCardWrapper>
</template>

<style scoped>

</style>
