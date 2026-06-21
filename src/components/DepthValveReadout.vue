<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTelemetryStore } from '@/store/telemetry'
import { paToDepthM, ATMOSPHERIC_PA } from '@/composables/useUnits'
import { trendOf } from '@/composables/useTrend'

// Slim instrument strip that sits on the LEFT edge of the stage, hugging the
// UUV model -- the mirror twin of the compact liveness strip on the right.
// Read-only: the actual valve toggles live in the Debug Commands panel. Depth
// is derived from the external pressure sensor (absolute Pa) so we show both
// the metres figure and the raw Pa it came from, plus a direction-of-travel
// triangle on the depth. The metres figure is referenced to the surface the
// operator registered pre-dive (nautilus/status/init) so it reads ~0 at the
// surface; until one is registered the standard atmosphere is the fallback --
// the same SurfaceReference frame the glider's controllers use.
const { externalPressure, bcuValves, surfaceReferencePa } = storeToRefs(useTelemetryStore())

const latestExtPa = computed(() => externalPressure.value[0]?.value ?? null)
const depthM = computed(() =>
  latestExtPa.value === null
    ? null
    : paToDepthM(latestExtPa.value, surfaceReferencePa.value ?? ATMOSPHERIC_PA),
)
// ~100 Pa deadband (~0.01 m) so a settled depth doesn't flicker the arrow.
const depthTrend = computed(() => trendOf(externalPressure.value, { back: 5, eps: 100 }))
// Depth grows downward, so the travel arrow is the INVERSE of the pressure
// trend: rising pressure (diving) points the triangle DOWN, surfacing points
// UP. Both the glyph and the up/down colour follow this, so a diving readout
// reads as a down triangle -- consistent with every other gauge's arrows.
const depthArrow = computed(() =>
  depthTrend.value === 'up' ? 'down' : depthTrend.value === 'down' ? 'up' : 'flat',
)

// Valve bitmap: bit0 = motor way (operator "Valve 2"), bit1 = free/bypass way
// (operator "Valve 1") -- same convention as DebugCommandsPanel.
const latestValves = computed(() => bcuValves.value[0]?.value ?? null)
const motorOpen = computed(
  () => latestValves.value !== null && (latestValves.value & 1) !== 0,
)
const freeOpen = computed(
  () => latestValves.value !== null && (latestValves.value & 2) !== 0,
)
</script>

<template>
  <div class="dv">
    <div class="dv-depth">
      <div class="dv-cap">Depth</div>
      <div class="dv-depth-row">
        <span class="dv-val">{{ depthM === null ? '—' : depthM.toFixed(2) }}</span>
        <span class="dv-unit">m</span>
        <span class="dv-trend" :class="depthArrow" aria-hidden="true">
          <template v-if="depthArrow === 'up'">&#9650;</template>
          <template v-else-if="depthArrow === 'down'">&#9660;</template>
          <template v-else>&middot;</template>
        </span>
      </div>
      <div class="dv-pa">({{ latestExtPa === null ? '—' : Math.round(latestExtPa) }} Pa)</div>
    </div>

    <div class="dv-valves">
      <div class="dv-valve">
        <span class="dv-dot" :class="{ on: freeOpen }" />
        <span class="dv-vlabel">Valve 1<small>Empty path</small></span>
      </div>
      <div class="dv-valve">
        <span class="dv-dot" :class="{ on: motorOpen }" />
        <span class="dv-vlabel">Valve 2<small>Motor</small></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dv {
  display: flex;
  flex-direction: column;
  gap: 22px;
  /* Floats beside the model, sized to its own content (independent of the
     subsystem panel) and anchored to the top of that content. */
  justify-content: flex-start;
  /* Hug the model: this strip sits on the model's left, so its content rides
     the right edge (toward the gyro) -- the mirror of the subsystem labels,
     which ride the left edge of the strip on the model's right. */
  align-items: flex-end;
  text-align: right;
  /* Framed blue instrument panel -- transparent fill, accent border + caption
     only. The padding (esp. on the gyro-facing right edge) keeps the readout
     clear of the cage; the stage gap adds more. */
  padding: 16px 14px;
  border: 1px solid var(--panel-depth-border);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition);
}

/* ── Depth block ─────────────────────────────────────────────────────────── */
.dv-depth { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }

.dv-depth-row { display: flex; align-items: baseline; gap: 4px; }

.dv-val {
  font-family: var(--font-mono);
  font-size: 28px;
  font-weight: 500;
  line-height: 1;
  color: var(--metric-value);
  letter-spacing: -0.02em;
}
.dv-unit {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}
.dv-trend { font-size: 10px; line-height: 1; color: var(--text-hint); }
.dv-trend.up { color: var(--status-ok-text); }
.dv-trend.down { color: var(--status-err-text); }

.dv-pa {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.dv-cap {
  margin-bottom: 4px;
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--panel-depth-accent);
}

/* ── Valves ──────────────────────────────────────────────────────────────── */
.dv-valves { display: flex; flex-direction: column; gap: 9px; align-items: flex-end; }

.dv-valve { display: flex; align-items: center; gap: 8px; }

.dv-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--gauge-track);
  border: 1px solid var(--border-btn);
  transition: background 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.dv-dot.on {
  background: var(--status-ok-text);
  border-color: var(--status-ok-text);
  box-shadow: 0 0 6px var(--accent-glow);
}

.dv-vlabel {
  display: flex;
  flex-direction: column;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.25;
}
.dv-vlabel small {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
</style>
