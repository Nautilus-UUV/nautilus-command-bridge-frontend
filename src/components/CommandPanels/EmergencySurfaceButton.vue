<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'

// Slide-to-activate (the "slide to power off" pattern). The deliberate drag
// IS the confirmation -- no dialog. Idle rests on the left; drag past the
// threshold to engage (blow ballast). Once armed it rests on the right;
// drag back past the threshold to cancel/resume. Both edges publish to the
// emergency-surface debug topic, which bcu_debug acts on.
const EMERGENCY_TOPIC = 'nautilus/cmd/debug/emergency_surface'
const THRESHOLD = 0.9
const THUMB_W = 56 // px -- keep in sync with .es-thumb width in CSS

const mqtt = useMqttBridgeStore()
const bridgeOnline = computed(() => mqtt.bridgeStatus === 'online')

const trackEl = ref<HTMLElement | null>(null)
const armed = ref(false)
const dragging = ref(false)
const thumbX = ref(0)
const maxX = ref(0)
let grabOffset = 0

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x))
}

function measure() {
  const w = trackEl.value?.clientWidth ?? 0
  maxX.value = Math.max(0, w - THUMB_W)
  if (!dragging.value) thumbX.value = armed.value ? maxX.value : 0
}

let ro: ResizeObserver | null = null
onMounted(() => {
  measure()
  ro = new ResizeObserver(measure)
  if (trackEl.value) ro.observe(trackEl.value)
})
onBeforeUnmount(() => ro?.disconnect())

function onPointerDown(e: PointerEvent) {
  if (!bridgeOnline.value) return
  measure()
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  const rect = trackEl.value!.getBoundingClientRect()
  grabOffset = e.clientX - (rect.left + thumbX.value)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return
  const rect = trackEl.value!.getBoundingClientRect()
  thumbX.value = clamp(e.clientX - rect.left - grabOffset, 0, maxX.value)
}

function onPointerUp(e: PointerEvent) {
  if (!dragging.value) return
  dragging.value = false
  try {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId)
  } catch { /* pointer already released */ }

  const frac = maxX.value > 0 ? thumbX.value / maxX.value : 0
  if (!armed.value && frac >= THRESHOLD) {
    armed.value = true
    // Stop the active mission first so depth_node goes silent before bcu_debug
    // blows ballast -- otherwise the depth PID would fight the surface burst.
    mqtt.stopMission()
    mqtt.publish(EMERGENCY_TOPIC, { data: true })
  } else if (armed.value && frac <= 1 - THRESHOLD) {
    armed.value = false
    mqtt.publish(EMERGENCY_TOPIC, { data: false })
  }
  // Snap to the resting position for the resulting state.
  thumbX.value = armed.value ? maxX.value : 0
}
</script>

<template>
  <div class="es-track" ref="trackEl" :class="{ armed, disabled: !bridgeOnline }">
    <span class="es-label">
      <template v-if="!bridgeOnline">bridge offline</template>
      <template v-else-if="armed">SURFACING — slide to cancel</template>
      <template v-else>Slide to surface →</template>
    </span>
    <div
      class="es-thumb"
      :class="{ dragging }"
      :style="{ transform: `translateX(${thumbX}px)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <v-icon size="18">{{ armed ? 'mdi-arrow-left-bold' : 'mdi-arrow-right-bold' }}</v-icon>
    </div>
  </div>
</template>

<style scoped>
.es-track {
  position: relative;
  height: 44px;
  border-radius: 6px;
  background: var(--status-err-bg, rgba(220, 38, 38, 0.12));
  border: 1px solid var(--status-err-border, rgba(220, 38, 38, 0.5));
  overflow: hidden;
  user-select: none;
  touch-action: none;
}
.es-track.armed {
  background: var(--status-err-border, rgba(220, 38, 38, 0.5));
  border-color: var(--status-err-text, #dc2626);
}
.es-track.disabled {
  opacity: 0.5;
  background: var(--bg-btn);
  border-color: var(--border-btn);
}

.es-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--status-err-text, #dc2626);
  pointer-events: none;
}
.es-track.armed .es-label { color: #fff; }
.es-track.disabled .es-label { color: var(--text-hint); }

.es-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 56px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--status-err-text, #dc2626);
  color: #fff;
  cursor: grab;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
.es-thumb:active { cursor: grabbing; }
.es-thumb:not(.dragging) {
  transition: transform 0.2s ease;
}
.es-track.disabled .es-thumb {
  background: var(--border-btn);
  cursor: not-allowed;
}
</style>
