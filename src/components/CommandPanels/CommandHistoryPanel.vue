<script setup lang="ts">
import SimpleCardWrapper from "@/components/SimpleCardWrapper.vue"
import { DateTime } from "luxon"
import { useCommandStore } from "@/store/commands"
import { storeToRefs } from "pinia"

const commandStore = useCommandStore()
const { commands } = storeToRefs(commandStore)
const { extendedLoad } = commandStore
</script>

<template>
<SimpleCardWrapper title="Command History">
  <div v-if="!commands" class="d-flex align-center justify-center" style="height:64px">
    <v-progress-circular indeterminate color="primary" size="28" width="2" />
  </div>

  <div v-else class="flex-1-1 position-relative">
    <div class="hist-scroll position-absolute top-0 left-0 w-100 h-100">
      <v-infinite-scroll mode="manual" class="h-100" @load="extendedLoad">
        <template v-for="(cmd, i) in commands" :key="cmd.command_id">
          <div v-if="i > 0" class="divider" />
          <div class="cmd-row">
            <span
              class="status-pill"
              :class="{
                'pill-q':   cmd.status === 'queued',
                'pill-ok':  cmd.status === 'acknowledged',
                'pill-err': cmd.status === 'failed',
              }"
            >
              <v-icon size="10" class="mr-1">{{
                cmd.status === 'queued'
                  ? `mdi-numeric-${cmd.send_retries < 10 ? cmd.send_retries : '9-plus'}-circle`
                  : cmd.status === 'acknowledged' ? 'mdi-check' : 'mdi-alert-circle'
              }}</v-icon>
              {{ cmd.status === 'queued' ? 'sent' : cmd.status }}
            </span>

            <div class="cmd-info">
              <div class="cmd-type">{{ cmd.command }}</div>
              <div class="cmd-id">{{ cmd.command_id }}</div>
            </div>

            <span class="cmd-time">
              {{ DateTime.fromISO(cmd.last_update_datetime, {zone:'system'}).toFormat('HH:mm:ss') }}
            </span>
          </div>
        </template>
      </v-infinite-scroll>
    </div>
  </div>
</SimpleCardWrapper>
</template>

<style scoped>
.hist-scroll {
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
}

.divider { height: 1px; background: var(--border-divider); margin: 0 10px; }

.cmd-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
}

/* ── Status pills ───────────────────────────────────────────────────── */
.status-pill {
  display: inline-flex; align-items: center;
  flex-shrink: 0; width: 84px;
  font-size: 10px; font-weight: 600;
  padding: 2px 7px; border-radius: 3px;
  letter-spacing: 0.04em; text-transform: uppercase;
}
.pill-q   { background: var(--status-q-bg);   color: var(--status-q-text);   border: 1px solid var(--status-q-border); }
.pill-ok  { background: var(--status-ok-bg);  color: var(--status-ok-text);  border: 1px solid var(--status-ok-border); }
.pill-err { background: var(--status-err-bg); color: var(--status-err-text); border: 1px solid var(--status-err-border); }

/* ── Command info ─────────────────────────────────────────────────── */
.cmd-info { flex: 1 1 auto; min-width: 0; }
.cmd-type {
  font-family: var(--font-ui); font-size: 12px; font-weight: 500;
  color: var(--text); letter-spacing: 0.01em;
}
.cmd-id {
  font-family: var(--font-mono); font-size: 9.5px; color: var(--text-hint);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  margin-top: 1px;
}

/* ── Timestamp ───────────────────────────────────────────────────── */
.cmd-time {
  font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);
  flex-shrink: 0;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-input);
}
</style>
