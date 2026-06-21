<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useMqttBridgeStore } from '@/store/mqttBridge'

// The deploy-time dead-man failsafe. Arming is retained on the broker so a
// glider-side bridge restart re-arms itself; the glider confirms its state on
// nautilus/status/lifeguard (retained), and THAT is what this button renders —
// never an optimistic local flag. The one exception is a lost link: the glider
// can't tell us anything then, so we run its own dead-man clock locally
// (timeout_s rides in the status payload) and show a countdown, then
// "presumed engaged" until the link returns and the retained status confirms.
const LIFEGUARD_CMD_TOPIC = 'nautilus/cmd/lifeguard'
const LIFEGUARD_STATUS_TOPIC = 'nautilus/status/lifeguard'

interface LifeguardStatus {
  armed: boolean
  engaged: boolean
  timeout_s: number
}

const mqtt = useMqttBridgeStore()

const status = ref<LifeguardStatus | null>(null)
const unsubscribe = mqtt.subscribe(LIFEGUARD_STATUS_TOPIC, (payload) => {
  const p = payload as Partial<LifeguardStatus>
  status.value = {
    armed: !!p.armed,
    engaged: !!p.engaged,
    timeout_s: typeof p.timeout_s === 'number' ? p.timeout_s : 15,
  }
})
onBeforeUnmount(unsubscribe)

const armed = computed(() => status.value?.armed ?? false)
const engaged = computed(() => status.value?.engaged ?? false)

// Heartbeats only reach the glider while the browser holds the broker AND the
// bridge holds the broker -- either leg down means the dead-man clock is running.
const linkUp = computed(() => mqtt.connected && mqtt.bridgeStatus === 'online')

// Local inference clock for the link-down window.
const linkDownAt = ref<number | null>(null)
const nowMs = ref(Date.now())
let ticker: number | undefined

watch(
  [linkUp, armed],
  ([up, isArmed]) => {
    if (!up && isArmed && linkDownAt.value === null) {
      linkDownAt.value = Date.now()
      nowMs.value = Date.now()
      ticker = window.setInterval(() => {
        nowMs.value = Date.now()
      }, 1000)
    } else if ((up || !isArmed) && linkDownAt.value !== null) {
      linkDownAt.value = null
      if (ticker !== undefined) {
        clearInterval(ticker)
        ticker = undefined
      }
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (ticker !== undefined) clearInterval(ticker)
})

const secondsToFire = computed(() => {
  if (linkDownAt.value === null || status.value === null) return null
  return Math.ceil(
    status.value.timeout_s - (nowMs.value - linkDownAt.value) / 1000,
  )
})

type DisplayState = 'off' | 'armed' | 'countdown' | 'presumed' | 'engaged'
const state = computed<DisplayState>(() => {
  if (engaged.value) return 'engaged'
  if (!armed.value) return 'off'
  if (secondsToFire.value === null) return 'armed'
  return secondsToFire.value <= 0 ? 'presumed' : 'countdown'
})

const label = computed(() => {
  switch (state.value) {
    case 'off':
      return 'Lifeguard off'
    case 'armed':
      return 'Lifeguard armed'
    case 'countdown':
      return `Link lost — lifeguard fires in ${secondsToFire.value}s`
    case 'presumed':
      return 'Lifeguard presumed engaged'
    case 'engaged':
      return 'Lifeguard engaged — surfacing'
  }
})

function toggle(): void {
  if (!linkUp.value) return
  mqtt.publish(LIFEGUARD_CMD_TOPIC, { data: !armed.value }, { retain: true })
}
</script>

<template>
  <button
    class="lg-btn"
    :class="{
      armed: state === 'armed',
      alert: state === 'countdown' || state === 'presumed' || state === 'engaged',
    }"
    :disabled="!linkUp"
    @click="toggle"
  >
    <span class="lg-emit" aria-hidden="true"></span>
    <span class="lg-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.lg-btn {
  position: relative; /* above the init-bar's ::before fill */
  z-index: 1;
  overflow: hidden; /* clips the emission sweep to the button */
  min-width: 268px;
  height: 38px;
  padding: 0 20px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-btn);
  background: var(--bg-btn);
  color: var(--text-hint);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition),
    color var(--transition);
}
.lg-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.lg-label {
  position: relative; /* above the emission layer */
}

/* ARMED: ocean accent, breathing glow + the centre-out emission ping. */
.lg-btn.armed {
  border-color: var(--accent-border);
  background: var(--accent-light);
  color: var(--accent);
  animation: lg-breathe 1.8s ease-out infinite;
}

/* COUNTDOWN / PRESUMED / ENGAGED: error palette, faster pulse — a fired (or
   about-to-fire) lifeguard must be unmissable even while disabled (link down). */
.lg-btn.alert,
.lg-btn.alert:disabled {
  opacity: 1;
  border-color: var(--status-err-border);
  background: var(--status-err-bg);
  color: var(--status-err-text);
  animation: lg-breathe-alert 1.1s ease-out infinite;
}

/* The emission layer: a band of glow expanding from the button's centre to
   its edges and fading out, like a sonar ping. */
.lg-emit {
  position: absolute;
  inset: 0;
  transform-origin: center;
  pointer-events: none;
}
.lg-btn.armed .lg-emit {
  background: linear-gradient(
    90deg,
    transparent,
    var(--accent-glow) 35%,
    var(--accent-glow) 65%,
    transparent
  );
  animation: lg-emit 1.8s ease-out infinite;
}
.lg-btn.alert .lg-emit {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(220, 38, 38, 0.22) 35%,
    rgba(220, 38, 38, 0.22) 65%,
    transparent
  );
  animation: lg-emit 1.1s ease-out infinite;
}

@keyframes lg-emit {
  0% {
    transform: scaleX(0.05);
    opacity: 0;
  }
  15% {
    opacity: 1;
  }
  100% {
    transform: scaleX(1);
    opacity: 0;
  }
}
@keyframes lg-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 var(--accent-glow);
  }
  50% {
    box-shadow: 0 0 16px 3px var(--accent-glow);
  }
}
@keyframes lg-breathe-alert {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
  }
  50% {
    box-shadow: 0 0 18px 4px rgba(220, 38, 38, 0.35);
  }
}
</style>
