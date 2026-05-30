<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useMqttBridgeStore } from '@/store/mqttBridge'
import { useOverridesStore } from '@/store/overrides'

// Slide-to-activate (same deliberate-drag pattern as the emergency button).
// The drag IS the confirmation for entering manual mode -- no dialog. Idle
// rests on the left (autonomous); drag past the threshold to engage manual
// control. Once engaged it rests on the right; drag back to hand control to
// the autopilot. Each edge writes the override flags through the store.
const THRESHOLD = 0.9
const THUMB_W = 56 // px -- keep in sync with .mo-thumb width in CSS

const mqtt = useMqttBridgeStore()
const overrides = useOverridesStore()
const { manualOverride } = storeToRefs(overrides)
const bridgeOnline = computed(() => mqtt.bridgeStatus === 'online')

const trackEl = ref<HTMLElement | null>(null)
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
  if (!dragging.value) thumbX.value = manualOverride.value ? maxX.value : 0
}

// Reflect external changes (emergency auto-enable, another operator, reconnect
// telemetry) by snapping the thumb to the resting position for the new state.
watch(manualOverride, () => {
  if (!dragging.value) thumbX.value = manualOverride.value ? maxX.value : 0
})

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
  if (!manualOverride.value && frac >= THRESHOLD) {
    overrides.setManualOverride(true)
  } else if (manualOverride.value && frac <= 1 - THRESHOLD) {
    overrides.setManualOverride(false)
  }
  // Snap to the resting position for the resulting state.
  thumbX.value = manualOverride.value ? maxX.value : 0
}
</script>

<template>
  <div class="mo-track" ref="trackEl" :class="{ armed: manualOverride, disabled: !bridgeOnline }">
    <span class="mo-label">
      <template v-if="!bridgeOnline">bridge offline</template>
      <template v-else-if="manualOverride">MANUAL OVERRIDE — slide to release</template>
      <template v-else>Slide for manual override →</template>
    </span>
    <div
      class="mo-thumb"
      :class="{ dragging }"
      :style="{ transform: `translateX(${thumbX}px)` }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <v-icon size="18">{{ manualOverride ? 'mdi-arrow-left-bold' : 'mdi-hand-back-right-outline' }}</v-icon>
    </div>
  </div>
</template>

<style scoped>
.mo-track {
  position: relative;
  height: 44px;
  border-radius: 6px;
  background: var(--bg-btn);
  border: 1px solid var(--border-btn);
  overflow: hidden;
  user-select: none;
  touch-action: none;
}
.mo-track.armed {
  background: var(--accent-active-bg);
  border-color: var(--accent-border);
}
.mo-track.disabled {
  opacity: 0.5;
}

.mo-label {
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
  color: var(--text-muted);
  pointer-events: none;
}
.mo-track.armed .mo-label { color: var(--accent); }
.mo-track.disabled .mo-label { color: var(--text-hint); }

.mo-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 56px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: var(--accent);
  color: #fff;
  cursor: grab;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
.mo-thumb:active { cursor: grabbing; }
.mo-thumb:not(.dragging) {
  transition: transform 0.2s ease;
}
.mo-track.disabled .mo-thumb {
  background: var(--border-btn);
  cursor: not-allowed;
}
</style>
