<script setup lang="ts">
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue";
import draggable from "vuedraggable";
import {useMissionStore} from "@/store/missions";
import {storeToRefs} from "pinia";

const missionStore = useMissionStore();
const {missions, currentMission, selectedMissionId} = storeToRefs(missionStore);
const {createMission, updateMission, deleteMission} = missionStore;

function addWaypoint() {
  if (currentMission.value) {
    let uniqueId = 0;
    if (currentMission.value.waypoints.length > 0) {
      uniqueId = currentMission.value.waypoints[currentMission.value.waypoints.length - 1].id + 1;
    }

    while (currentMission.value.waypoints.some(w => w.id === uniqueId)) {
      uniqueId++;
    }

    currentMission.value.waypoints.push({depth: 0, pause_duration: 0, id: uniqueId});
  }
}
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
    <v-btn
      icon="mdi-plus"
      variant="outlined"
      @click="createMission"
    />
    <v-select
      label="Dive Profile Selection"
      hide-details
      max-width="400"
      variant="outlined"
      :items="missions"
      v-model="selectedMissionId"
      item-title="name"
      item-value="mission_id"
    />
    <v-btn
      icon="mdi-content-save"
      variant="outlined"
      :disabled="!currentMission"
      @click="updateMission()"
    />

    <v-btn
      icon="mdi-delete"
      variant="flat"
      color="error"
      @click="deleteMission()"
      :disabled="missions.length <= 1 || !currentMission"
    />
  </div>
  <div
    class="d-flex align-center flex-0-0"
    v-if="currentMission"
  >
    <v-text-field
      label="Name"
      hide-details
      v-model="currentMission.name"
    />
  </div>
  <div
    class="flex-1-1 position-relative"
    v-if="currentMission"
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
        v-model="currentMission.waypoints"
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
            <td>
              <v-text-field
                v-model="element.depth"
                hide-details
                variant="outlined"
                type="number"
                min="0"
                suffix="m"
                density="compact"
              />
            </td>
            <td>
              <v-text-field
                v-model="element.pause_duration"
                hide-details
                variant="outlined"
                type="number"
                min="0"
                suffix="s"
                density="compact"
              />
            </td>
            <td
              class="text-right"
            >
              <v-btn
                class="ml-2"
                icon="mdi-delete"
                size="small"
                density="comfortable"
                variant="text"
                color="error"
                @click="currentMission.waypoints.splice(index, 1)"
              />
            </td>
          </tr>
        </template>

        <template #footer>
          <tr>
            <td
              class="text-center"
              colspan="4"
            >
              <v-btn
                variant="outlined"
                @click="addWaypoint"
              >
                Add Waypoint
              </v-btn>
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
