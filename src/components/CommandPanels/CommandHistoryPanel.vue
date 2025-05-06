<script setup lang="ts">
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue";
import { DateTime } from "luxon";
import {useCommandStore} from "@/store/commands";
import {storeToRefs} from "pinia";

const commandStore = useCommandStore();
const {commands} = storeToRefs(commandStore);
const {extendedLoad} = commandStore;

</script>

<template>
<SimpleCardWrapper
  title="Command History"
>
  <div
    v-if="!commands"
    class="d-flex align-center justify-center"
  >
    <v-progress-circular
      indeterminate
      color="primary"
      size="40"
      width="4"
    />
  </div>
  <div
    v-else
    class="flex-1-1 position-relative"
  >
    <v-list
      class="position-absolute top-0 left-0 w-100 h-100 bg-grey-lighten-5 border-sm rounded-lg px-3"
      fixed-header
    >
      <v-infinite-scroll
        mode="manual"
        class="h-100"
        @load="extendedLoad"
      >
        <template
          v-for="(command, index) in commands"
          :key="command.command_id"
        >
          <div>
            <v-divider
              v-if="index > 0"
            />
            <v-list-item
              class="px-1"
            >
              <template
                #prepend
              >
                <div
                  style="width: 170px"
                >
                  <v-chip
                    density="comfortable"
                    size="large"
                    color="amber-darken-4"
                    :prepend-icon="`mdi-numeric-${command.send_retries < 10 ? command.send_retries : '9-plus'}-circle`"
                    v-if="command.status === 'queued'"
                  >
                    queued / sent
                  </v-chip>
                  <v-chip
                    v-else
                    density="comfortable"
                    size="large"
                    :prepend-icon="command.status === 'acknowledged' ? 'mdi-check-bold' : 'mdi-alert-circle'"
                    :color="command.status === 'acknowledged' ? 'green-darken-4' : 'red-darken-4'"
                  >
                    {{ command.status }}
                  </v-chip>
                </div>
              </template>

              <v-list-item-title>
                {{ command.command }}
              </v-list-item-title>
              <v-list-item-subtitle>
                {{ command.command_id }}
              </v-list-item-subtitle>
              <template
                #append
              >
                <v-chip
                  variant="outlined"
                  density="comfortable"
                >
                  {{ DateTime.fromISO(command.last_update_datetime, {zone: 'system'}).toFormat('HH:mm:ss') }}
                </v-chip>
              </template>
            </v-list-item>
          </div>
        </template>
      </v-infinite-scroll>
    </v-list>
  </div>
</SimpleCardWrapper>
</template>

<style scoped>

</style>
