<script setup lang="ts">
import { computed } from 'vue'
import SimpleCardWrapper from '@/components/SimpleCardWrapper.vue'
import { useLivenessStore } from '@/store/liveness'
import { storeToRefs } from 'pinia'
import type { HealthState, SubsystemId } from '@/types/TelemetryTypes'

const { subsystems } = storeToRefs(useLivenessStore())

// Tether first (the moved bridge indicator, also the master gate), then the
// nine glider subsystems. In sim, IMU left/right share one source and the two
// valves share one bitmask, so each pair is liveness-correlated -- they can't
// fail independently until real hardware splits them.
interface Row { id: SubsystemId; label: string }
const ROWS: Row[] = [
  { id: 'tether', label: 'Tether' },
  { id: 'acu_pitch', label: 'ACU Pitch' },
  { id: 'acu_roll', label: 'ACU Roll' },
  { id: 'bcu_pump', label: 'BCU Pump' },
  { id: 'bcu_valve_1', label: 'BCU Valve 1' },
  { id: 'bcu_valve_2', label: 'BCU Valve 2' },
  { id: 'imu_left', label: 'IMU Left' },
  { id: 'imu_right', label: 'IMU Right' },
  { id: 'external_pressure', label: 'External Pressure' },
  { id: 'tank_pressure', label: 'Tank Pressure' },
]

const TONE: Record<HealthState, string> = {
  online: 'ok',
  offline: 'err',
  unknown: 'muted',
}

const rows = computed(() =>
  ROWS.map((r) => ({ ...r, state: subsystems.value[r.id] })),
)
</script>

<template>
<SimpleCardWrapper title="Link & Subsystems">
  <div class="health-list">
    <div v-for="row in rows" :key="row.id" class="health-row">
      <span class="health-label">{{ row.label }}</span>
      <span class="status-badge" :class="TONE[row.state]">
        <span class="status-dot" />
        {{ row.state }}
      </span>
    </div>
  </div>
</SimpleCardWrapper>
</template>

<style scoped>
.health-list {
  display: flex; flex-direction: column;
  gap: 6px;
}

.health-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
}

.health-label {
  font-family: var(--font-ui);
  font-size: 11.5px;
  color: var(--text-muted);
}

/* Same badge pattern as the (now-removed) bridge badge in CommandProfilePanel,
   with an added 'muted' tone for the unknown / gated state. */
.status-badge {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-mono); font-size: 10.5px; font-weight: 500;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  border: 1px solid;
  border-radius: 2px;
  text-transform: capitalize;
}
.status-badge.ok    { background: var(--status-ok-bg);  color: var(--status-ok-text);  border-color: var(--status-ok-border); }
.status-badge.err   { background: var(--status-err-bg); color: var(--status-err-text); border-color: var(--status-err-border); }
.status-badge.muted { background: transparent;          color: var(--text-muted);      border-color: var(--border); }

.status-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
}
</style>
