<script setup lang="ts">
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue";
import {ref} from "vue";
import { DateTime } from "luxon";

type CommandTypes = 'Mission_Profile' | 'Start' | 'Stop' | 'Pause' | 'Abort'
type CommandStatus = 'queued' | 'acknowledged' | 'failed'
interface Command {
  command_id: string,
  command: CommandTypes,
  status: CommandStatus,
  send_retries: number,
  last_send_time: string,
}

const commands = ref<Command[]>([
  {
    command_id: '1',
    command: 'Mission_Profile',
    send_retries: 3,
    last_send_time: '2025-05-06T19:28:32Z',
    status: 'queued',
  },
  {
    command_id: '2',
    command: 'Start',
    send_retries: 1,
    last_send_time: '2025-05-06T19:28:32Z',
    status: 'acknowledged',
  },
  {
    command_id: '3',
    command: 'Stop',
    send_retries: 0,
    last_send_time: '2025-05-06T19:28:32Z',
    status: 'failed',
  },
  {
    command_id: '4',
    command: 'Pause',
    send_retries: 2,
    last_send_time: '2025-05-06T19:28:32Z',
    status: 'queued',
  },
  {
    command_id: '5',
    command: 'Abort',
    send_retries: 1,
    last_send_time: '2025-05-06T19:28:32Z',
    status: 'acknowledged',
  },
  {
    command_id: '6',
    command: 'Mission_Profile',
    send_retries: 11,
    last_send_time: '2025-05-06T19:28:32Z',
    status: 'queued',
  },
  {
    command_id: '7',
    command: 'Start',
    send_retries: 1,
    last_send_time: '2025-05-06T19:28:32Z',
    status: 'acknowledged',
  },
]);
</script>

<template>
<SimpleCardWrapper
  title="Command History"
>
  <div
    class="flex-1-1 position-relative"
  >
    <v-list
      class="position-absolute top-0 left-0 w-100 h-100 bg-grey-lighten-5 border-sm rounded-lg px-3"
      fixed-header
    >
      <v-infinite-scroll
        mode="manual"
        class="h-100"
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
                  {{ DateTime.fromISO(command.last_send_time, {zone: 'system'}).toFormat('HH:mm:ss') }}
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
