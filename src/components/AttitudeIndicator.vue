<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  qw: number
  qx: number
  qy: number
  qz: number
  depth: number
}>()

const PITCH_SCALE = 2.0 // px per degree

// ── Euler angles from quaternion ────────────────────────────────────────
const roll = computed(() => {
  const { qw, qx, qy, qz } = props
  const sinr = 2 * (qw * qx + qy * qz)
  const cosr = 1 - 2 * (qx * qx + qy * qy)
  return Math.atan2(sinr, cosr) * 180 / Math.PI
})

const pitch = computed(() => {
  const { qw, qx, qy, qz } = props
  const sinp = 2 * (qw * qy - qz * qx)
  const val = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp)
  return val * 180 / Math.PI
})

const yaw = computed(() => {
  const { qw, qx, qy, qz } = props
  const siny = 2 * (qw * qz + qx * qy)
  const cosy = 1 - 2 * (qy * qy + qz * qz)
  return Math.atan2(siny, cosy) * 180 / Math.PI
})

const pitchOffset = computed(() => pitch.value * PITCH_SCALE)

// Pitch ladder: marks every 5 deg from -40 to +40, excluding 0
const pitchMarks: number[] = []
for (let i = -40; i <= 40; i += 5) { if (i !== 0) pitchMarks.push(i) }

// Roll ticks on the frame
const rollTicks = [
  { angle: 0, len: 10, major: true },
  { angle: -10, len: 5, major: false },
  { angle: 10, len: 5, major: false },
  { angle: -20, len: 5, major: false },
  { angle: 20, len: 5, major: false },
  { angle: -30, len: 10, major: true },
  { angle: 30, len: 10, major: true },
  { angle: -45, len: 5, major: false },
  { angle: 45, len: 5, major: false },
  { angle: -60, len: 10, major: true },
  { angle: 60, len: 10, major: true },
]
</script>

<template>
  <div class="ai-wrap">
    <svg viewBox="0 0 200 200" class="ai-svg">
      <defs>
        <clipPath id="ai-clip">
          <circle cx="100" cy="100" r="82" />
        </clipPath>
        <radialGradient id="ai-glass" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stop-color="white" stop-opacity="0.06" />
          <stop offset="100%" stop-color="white" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Outer frame -->
      <circle cx="100" cy="100" r="96" fill="#2c2c34" />
      <circle cx="100" cy="100" r="92" fill="#1e1e24" />

      <!-- Roll tick marks (fixed on frame) -->
      <g v-for="tick in rollTicks" :key="tick.angle">
        <g :transform="`rotate(${tick.angle}, 100, 100)`">
          <line
            x1="100" :y1="100 - 83"
            x2="100" :y2="100 - 83 - tick.len"
            stroke="white"
            :stroke-width="tick.major ? 1.5 : 0.8"
            :opacity="tick.major ? 0.85 : 0.45"
          />
        </g>
      </g>

      <!-- Fixed reference triangle at 12 o'clock -->
      <polygon points="100,16 97,9 103,9" fill="white" opacity="0.9" />

      <!-- ── Horizon (clipped to inner circle) ────────────────────── -->
      <g clip-path="url(#ai-clip)">
        <g :transform="`rotate(${-roll}, 100, 100)`">

          <!-- Roll pointer (rotates with horizon) -->
          <polygon points="100,20 97,13 103,13" fill="#e09030" />

          <g :transform="`translate(0, ${pitchOffset})`">
            <!-- Sky / surface -->
            <rect x="-100" y="-400" width="400" height="500" fill="#5ba3d9" />
            <!-- Deep water / below horizon -->
            <rect x="-100" y="100" width="400" height="500" fill="#1a3a5c" />
            <!-- Horizon line -->
            <line x1="-100" y1="100" x2="300" y2="100" stroke="white" stroke-width="1.5" />

            <!-- Pitch ladder -->
            <g v-for="deg in pitchMarks" :key="deg">
              <line
                :x1="deg % 10 === 0 ? 75 : 86"
                :y1="100 - deg * PITCH_SCALE"
                :x2="deg % 10 === 0 ? 125 : 114"
                :y2="100 - deg * PITCH_SCALE"
                stroke="white"
                :stroke-width="deg % 10 === 0 ? 1 : 0.5"
                :opacity="deg % 10 === 0 ? 0.7 : 0.3"
              />
              <!-- End ticks on 10-deg marks -->
              <template v-if="deg % 10 === 0">
                <line :x1="75" :y1="100 - deg * PITCH_SCALE"
                      :x2="75" :y2="100 - deg * PITCH_SCALE + (deg > 0 ? 4 : -4)"
                      stroke="white" stroke-width="0.8" opacity="0.5" />
                <line :x1="125" :y1="100 - deg * PITCH_SCALE"
                      :x2="125" :y2="100 - deg * PITCH_SCALE + (deg > 0 ? 4 : -4)"
                      stroke="white" stroke-width="0.8" opacity="0.5" />
              </template>
              <!-- Degree labels -->
              <text v-if="deg % 10 === 0"
                :x="68" :y="100 - deg * PITCH_SCALE + 3"
                fill="white" font-size="7" text-anchor="end" opacity="0.6"
                font-family="Inter, sans-serif"
              >{{ Math.abs(deg) }}</text>
              <text v-if="deg % 10 === 0"
                :x="132" :y="100 - deg * PITCH_SCALE + 3"
                fill="white" font-size="7" text-anchor="start" opacity="0.6"
                font-family="Inter, sans-serif"
              >{{ Math.abs(deg) }}</text>
            </g>
          </g>
        </g>
      </g>

      <!-- ── Fixed UUV symbol ─────────────────────────────────────── -->
      <line x1="32" y1="100" x2="78" y2="100" stroke="#e09030" stroke-width="2.5" stroke-linecap="round" />
      <line x1="78" y1="100" x2="86" y2="107" stroke="#e09030" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="100" cy="100" r="3" fill="#e09030" />
      <line x1="114" y1="107" x2="122" y2="100" stroke="#e09030" stroke-width="2.5" stroke-linecap="round" />
      <line x1="122" y1="100" x2="168" y2="100" stroke="#e09030" stroke-width="2.5" stroke-linecap="round" />

      <!-- Glass effect + inner ring -->
      <circle cx="100" cy="100" r="82" fill="url(#ai-glass)" />
      <circle cx="100" cy="100" r="82" fill="none" stroke="#3a3a44" stroke-width="1" />
    </svg>

    <!-- Digital readout -->
    <div class="ai-readout">
      <div class="ai-row"><span class="ai-lbl">Pitch</span><span class="ai-val">{{ pitch.toFixed(1) }}°</span></div>
      <div class="ai-row"><span class="ai-lbl">Roll</span><span class="ai-val">{{ roll.toFixed(1) }}°</span></div>
      <div class="ai-row"><span class="ai-lbl">Yaw</span><span class="ai-val">{{ yaw.toFixed(1) }}°</span></div>
      <div class="ai-row"><span class="ai-lbl">Depth</span><span class="ai-val">{{ depth.toFixed(1) }} m</span></div>
    </div>
  </div>
</template>

<style scoped>
.ai-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  gap: 10px;
  user-select: none;
}

.ai-svg {
  width: auto;
  height: 0;
  flex: 1 1 auto;
  max-width: 100%;
  max-height: calc(100% - 70px);
  aspect-ratio: 1;
}

/* ── Digital readout ──────────────────────────────────────────────────── */
.ai-readout {
  display: flex;
  gap: 14px;
  flex-shrink: 0;
}

.ai-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.ai-lbl {
  font-family: var(--font-mono);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-hint);
}

.ai-val {
  font-family: var(--font-mono);
  font-size: 11.5px;
  color: var(--text-muted);
}
</style>
