<script setup lang="ts">
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue";
import {ref} from "vue";
import draggable from "vuedraggable";

const waypoints = ref([

])
</script>

<template>
<SimpleCardWrapper
  style="min-height: 400px"
>
  <div
    class="d-flex align-center ga-2 pa-0 flex-0-0"
  >
    <div
      class="text-h5"
    >
      Dive Profile
    </div>
    <v-spacer/>
    <v-select
      label="Dive Profile Selection"
      hide-details
      max-width="400"
      variant="outlined"
    />
    <v-btn
      icon="mdi-content-save"
      variant="outlined"
    />

    <v-btn
      icon="mdi-delete"
      variant="flat"
      color="error"
    />
  </div>
  <div
    class="d-flex align-center flex-0-0"
  >
    <v-text-field
      label="Name"
      hide-details
    />
  </div>
  <div
    class="flex-1-1 position-relative"
  >
    <v-table
      class="position-absolute top-0 left-0 w-100 h-100 bg-grey-lighten-5 border-sm rounded-lg"
      fixed-header
    >
      <thead>
      <tr>
        <th
          class="text-left"
          style="width: 140px"
        >
          Waypoints
        </th>
        <th class="text-left">
          Depth
        </th>
        <th class="text-left">
          Duration
        </th>
        <th
          class="text-right"
          style="width: 100px"
        >
          Actions
        </th>
      </tr>
      </thead>
      <draggable
        v-model="waypoints"
        tag="tbody"
        handle=".drag-handle"
        item-key="id"
        ghost-class="bg-indigo-lighten-4"
      >
        <template #item="{element, index}">
          <tr>
            <td>
              <v-icon
                class="mr-3 drag-handle"
              >
                mdi-drag
              </v-icon>
              <span>
                # {{ index + 1 }}
              </span>
            </td>
            <td>{{ element.depth }} m</td>
            <td>{{ element.pause_duration }} s</td>
            <td
              class="text-right"
            >
              <v-btn
                icon="mdi-pencil"
                size="small"
                density="comfortable"
                variant="text"
              />
              <v-btn
                class="ml-2"
                icon="mdi-delete"
                size="small"
                density="comfortable"
                variant="text"
                color="error"
              />
            </td>
          </tr>
        </template>
      </draggable>
    </v-table>
  </div>
</SimpleCardWrapper>
</template>

<style scoped>

</style>
