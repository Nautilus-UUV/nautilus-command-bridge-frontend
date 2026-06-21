<script setup lang="ts">
import { computed } from 'vue'
import type { Trend } from '@/composables/useTrend'

// Reusable SVG arc gauge -- a ~270deg dial with the gap at the bottom, the
// value in the centre, a label below, and a small trend triangle. Data-driven
// and self-contained so the dashboard can v-for an array of specs through it
// (rpm / pitch / roll / tank today; temperature + more later) with no layout
// surgery. Colours come from CSS vars so it tracks the theme.
const props = withDefaults(
  defineProps<{
    value: number | null
    min: number
    max: number
    label: string
    unit?: string
    // Signed dials (rpm, roll) fill out from the value=0 baseline so positive
    // and negative read symmetrically; unsigned dials fill from the min end.
    signed?: boolean
    decimals?: number
    trend?: Trend
    // Accent override -- defaults to the theme accent so all dials match, but a
    // future temperature gauge could pass its own hue.
    color?: string
    // 'compact' shrinks the dial (and value font) so three fit side-by-side in
    // a box, e.g. the IMU ang-vel / accel panels. Default keeps the full size.
    size?: 'normal' | 'compact'
  }>(),
  {
    unit: '',
    signed: false,
    decimals: 0,
    trend: 'flat',
    color: 'var(--accent)',
    size: 'normal',
  },
)

// Geometry: 270deg sweep, gap centred on 6 o'clock. Angles are measured
// clockwise from +x (SVG y-down), so 135deg..405deg leaves 45deg..135deg open
// at the bottom.
const R = 40
const START = 135
const SWEEP = 270

function polar(deg: number, r = R) {
  const rad = (deg * Math.PI) / 180
  return { x: 50 + r * Math.cos(rad), y: 50 + r * Math.sin(rad) }
}
function arcPath(a: number, b: number, r = R) {
  const s = polar(a, r)
  const e = polar(b, r)
  const large = Math.abs(b - a) > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

const trackPath = arcPath(START, START + SWEEP)

// Clamped 0..1 position of the value in [min, max]. Handles min>max (e.g. the
// pitch dial runs 0 -> -119.5) since it's just a ratio.
const fraction = computed(() => {
  if (props.value === null || !Number.isFinite(props.value)) return null
  const span = props.max - props.min
  if (span === 0) return 0
  return Math.min(1, Math.max(0, (props.value - props.min) / span))
})

const fillPath = computed(() => {
  if (fraction.value === null) return null
  const valAngle = START + fraction.value * SWEEP
  if (props.signed) {
    const span = props.max - props.min
    const zf = span === 0 ? 0 : Math.min(1, Math.max(0, (0 - props.min) / span))
    const baseAngle = START + zf * SWEEP
    const a = Math.min(baseAngle, valAngle)
    const b = Math.max(baseAngle, valAngle)
    if (Math.abs(b - a) < 0.01) return null
    return arcPath(a, b)
  }
  if (fraction.value <= 0) return null
  return arcPath(START, valAngle)
})

const display = computed(() =>
  props.value === null || !Number.isFinite(props.value)
    ? '—'
    : props.value.toFixed(props.decimals),
)
</script>

<template>
  <div class="gauge" :class="{ compact: size === 'compact' }">
    <div class="gauge-dial">
      <svg viewBox="0 0 100 100" class="gauge-svg">
        <path :d="trackPath" class="gauge-track" fill="none" />
        <path
          v-if="fillPath"
          :d="fillPath"
          class="gauge-fill"
          fill="none"
          :style="{ stroke: color }"
        />
      </svg>
      <div class="gauge-center">
        <div class="gauge-value-row">
          <span class="gauge-value">{{ display }}</span>
          <span class="gauge-trend" :class="trend" aria-hidden="true">
            <template v-if="trend === 'up'">&#9650;</template>
            <template v-else-if="trend === 'down'">&#9660;</template>
            <template v-else>&middot;</template>
          </span>
        </div>
        <div v-if="unit" class="gauge-unit">{{ unit }}</div>
      </div>
    </div>
    <div class="gauge-label">{{ label }}</div>
  </div>
</template>

<style scoped>
.gauge {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  /* Fixed-width so the dials cluster centrally instead of stretching across the
     row; flex-wrap on the container keeps it fluid as gauges are added. */
  flex: 0 0 auto;
  /* Bigger than the old 150 but still narrow enough that all four dials hold a
     single row down to ~1366px laptops -- past 176px they wrap to two rows and
     starve the model below of stage height. */
  width: 160px;
  user-select: none;
}

.gauge-dial {
  position: relative;
  width: 100%;
  max-width: 148px;
  aspect-ratio: 1;
}

.gauge-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.gauge-track {
  stroke: var(--gauge-track);
  stroke-width: 5;
  stroke-linecap: round;
}

.gauge-fill {
  stroke-width: 5;
  stroke-linecap: round;
  filter: drop-shadow(0 0 3px var(--accent-glow));
  transition: stroke 0.15s ease;
}

.gauge-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  pointer-events: none;
}

.gauge-value-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.gauge-value {
  font-family: var(--font-mono);
  font-size: 30px;
  font-weight: 500;
  line-height: 1;
  color: var(--metric-value);
  letter-spacing: -0.01em;
}

.gauge-trend {
  font-size: 9px;
  line-height: 1;
  color: var(--text-hint);
}
.gauge-trend.up { color: var(--status-ok-text); }
.gauge-trend.down { color: var(--status-err-text); }

.gauge-unit {
  font-family: var(--font-mono);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.gauge-label {
  font-family: var(--font-ui);
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  text-align: center;
}

/* ── Compact variant: three dials per box (IMU ang-vel / accel) ──────────── */
.gauge.compact {
  width: 100px;
  gap: 3px;
}
.gauge.compact .gauge-dial {
  max-width: 92px;
}
.gauge.compact .gauge-value {
  font-size: 19px;
}
.gauge.compact .gauge-unit {
  font-size: 9px;
}
.gauge.compact .gauge-label {
  font-size: 9.5px;
}
</style>
