<script setup lang="ts">
import { computed } from 'vue'
import { useLivenessStore } from '@/store/liveness'
import { storeToRefs } from 'pinia'
import type { HealthState, SubsystemId } from '@/types/TelemetryTypes'

const { subsystems } = storeToRefs(useLivenessStore())

// Compact instrument strip that hugs the RIGHT edge of the stage -- the mirror
// twin of the depth+valve strip on the left. Tether first (the master gate),
// then the glider subsystems. Liveness-correlated pairs (the two valves share a
// bitmask) collapse onto one row with a dot each, so the strip reads as a tight
// "connections" list rather than ten boxes.
// Wiring is unchanged: states come straight from useLivenessStore.
interface Row { label: string; ids: SubsystemId[] }
const ROWS: Row[] = [
  { label: 'Tether', ids: ['tether'] },
  { label: 'ACU Pitch', ids: ['acu_pitch'] },
  { label: 'ACU Roll', ids: ['acu_roll'] },
  { label: 'BCU Pump', ids: ['bcu_pump'] },
  { label: 'Valves', ids: ['bcu_valve_1', 'bcu_valve_2'] },
  { label: 'IMU', ids: ['imu'] },
  { label: 'Ext Press', ids: ['external_pressure'] },
  { label: 'Tank Press', ids: ['tank_pressure'] },
]

const TONE: Record<HealthState, string> = {
  online: 'ok',
  offline: 'err',
  unknown: 'muted',
}

const rows = computed(() =>
  ROWS.map((r) => ({
    label: r.label,
    dots: r.ids.map((id) => ({ id, tone: TONE[subsystems.value[id]] })),
  })),
)
</script>

<template>
  <div class="ss">
    <div class="ss-cap">Subsystems</div>
    <div class="ss-list">
      <div v-for="row in rows" :key="row.label" class="ss-row">
        <span class="ss-label">{{ row.label }}</span>
        <span class="ss-dots">
          <span
            v-for="dot in row.dots"
            :key="dot.id"
            class="ss-dot"
            :class="dot.tone"
          />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ss {
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Floats beside the model, sized to its own 8-row content (independent of the
     depth panel opposite it). */
  justify-content: flex-start;
  /* Framed violet instrument panel -- the twin of the blue depth strip on the
     model's other side. Transparent fill, accent border + caption only.
     Padding keeps the labels clear of the gyro cage. */
  padding: 16px 14px;
  border: 1px solid var(--panel-subsys-border);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition);
}

.ss-cap {
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--panel-subsys-accent);
}

.ss-list { display: flex; flex-direction: column; gap: 9px; }

.ss-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ss-label {
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.ss-dots { display: inline-flex; gap: 4px; }

.ss-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--gauge-track);
  border: 1px solid var(--border-btn);
  transition: background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.ss-dot.ok {
  background: var(--status-ok-text);
  border-color: var(--status-ok-text);
  box-shadow: 0 0 5px var(--accent-glow);
}
.ss-dot.err {
  background: var(--status-err-text);
  border-color: var(--status-err-text);
}
.ss-dot.muted {
  background: transparent;
  border-color: var(--border);
}
</style>
