<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useTelemetryStore } from '@/store/telemetry'
import { trendOf } from '@/composables/useTrend'

import CircularGauge from '@/components/CircularGauge.vue'
import DepthValveReadout from '@/components/DepthValveReadout.vue'
import UUVViewer from '@/components/UUVViewer.vue'
import EmergencySurfaceButton from '@/components/CommandPanels/EmergencySurfaceButton.vue'
import LifeguardToggle from '@/components/CommandPanels/LifeguardToggle.vue'
import DiveInitPanel from '@/components/CommandPanels/DiveInitPanel.vue'
import DbWriterControl from '@/components/CommandPanels/DbWriterControl.vue'
import DebugCommandsPanel from '@/components/CommandPanels/DebugCommandsPanel.vue'
import ResetButton from '@/components/CommandPanels/ResetButton.vue'
import SubsystemHealthPanel from '@/components/CommandPanels/SubsystemHealthPanel.vue'
import CommandProfilePanel from '@/components/CommandPanels/CommandProfilePanel.vue'

// Live values read straight from the telemetry store (MQTT-fed). The gauge row
// is data-driven: each entry is a self-contained spec, so adding a temperature
// dial (or any future metric) is one more object here + its accessor -- the
// fluid flex-wrap container reflows on its own. Ranges are grounded in
// robot_specs.py (BCU_MOTOR_MAX_RPM, ACU_PITCH_MAX_TRAVEL_M, ACU_ROLL_MAX_ANGLE).
const { bcuRpm, bcuFeedbackRpm, acuPitch, acuRoll, bcuPressure, externalTemperature, imu, position } = storeToRefs(useTelemetryStore())

const latest = (s: { value: { value: number }[] }) => s.value[0]?.value ?? null

// 3D model view mode: 'freelook' orbits the camera freely (default), 'locked'
// tilts the model to the estimator's inferred roll/pitch and lets drag spin
// only the yaw view (which the glider can't observe).
const modelView = ref<'freelook' | 'locked'>('freelook')
function toggleModelView() {
  modelView.value = modelView.value === 'locked' ? 'freelook' : 'locked'
}
// Inferred attitude off /position/estimation (the estimator pins yaw to 0).
// Identity until the first pose arrives, so freelook starts level.
const poseQuat = computed(
  () => position.value[0]?.value?.orientation ?? { x: 0, y: 0, z: 0, w: 1 },
)

const gauges = computed(() => {
  const rollRaw = latest(acuRoll)
  const tankRaw = latest(bcuPressure)
  // Order: the two BCU dials operators watch most (pump output + tank pressure)
  // lead, then the ACU attitude pair.
  return [
    {
      key: 'rpm',
      label: 'Commanded RPM',
      value: latest(bcuRpm),
      min: -4000, max: 4000, signed: true, unit: 'rpm', decimals: 0,
      trend: trendOf(bcuRpm.value, { back: 5, eps: 20 }),
    },
    {
      key: 'feedback-rpm',
      label: 'Feedback RPM',
      value: latest(bcuFeedbackRpm),
      min: -4000, max: 4000, signed: true, unit: 'rpm', decimals: 0,
      trend: trendOf(bcuFeedbackRpm.value, { back: 5, eps: 20 }),
    },
    {
      key: 'tank',
      label: 'Tank Press',
      value: tankRaw === null ? null : tankRaw / 1000, // Pa -> kPa for the dial
      min: 0, max: 200, signed: false, unit: 'kPa', decimals: 1,
      trend: trendOf(bcuPressure.value, { back: 5, eps: 100 }), // 100 Pa
    },
    {
      key: 'pitch',
      label: 'ACU Pitch',
      value: latest(acuPitch),
      min: 0, max: -119.5, signed: false, unit: 'mm', decimals: 0,
      trend: trendOf(acuPitch.value, { back: 5, eps: 1 }),
    },
    {
      key: 'roll',
      label: 'ACU Roll',
      value: rollRaw === null ? null : rollRaw / 100, // wire is centidegrees
      min: -30, max: 30, signed: true, unit: 'deg', decimals: 1,
      trend: trendOf(acuRoll.value, { back: 5, eps: 10 }), // 10 cdeg = 0.1 deg
    },
    {
      // Seawater temperature, already in °C off the bridge -- passes through.
      key: 'ext-temp',
      label: 'Ext Temp',
      value: latest(externalTemperature),
      min: 0, max: 30, signed: false, unit: '°C', decimals: 1,
      trend: trendOf(externalTemperature.value, { back: 5, eps: 0.1 }), // 0.1 °C deadband
    },
  ]
})

// IMU gauge boxes. The /imu stream carries SI (rad/s, m/s^2); the dials
// present operator-friendly units -- angular velocity in °/s, acceleration in
// mg -- so the conversion is presentation-only here. Display ranges are picked
// for readability (a glider's rates/accels are well inside the sensor's ±2000
// °/s / ±6 g full scale), independent of the sensor scaling in robot_specs.py.
const latestImu = computed(() => imu.value[0]?.value ?? null)
const RAD_TO_DEG = 180 / Math.PI
const MPS2_TO_MG = 1000 / 9.80665

const angVelGauges = computed(() => {
  const w = latestImu.value?.angular_velocity
  const dps = (v?: number) => (v == null ? null : v * RAD_TO_DEG)
  return [
    { key: 'roll', label: 'Roll', value: dps(w?.x), min: -180, max: 180, signed: true, unit: '°/s', decimals: 1 },
    { key: 'pitch', label: 'Pitch', value: dps(w?.y), min: -180, max: 180, signed: true, unit: '°/s', decimals: 1 },
    { key: 'yaw', label: 'Yaw', value: dps(w?.z), min: -180, max: 180, signed: true, unit: '°/s', decimals: 1 },
  ]
})

const accelGauges = computed(() => {
  const a = latestImu.value?.linear_acceleration
  const mg = (v?: number) => (v == null ? null : v * MPS2_TO_MG)
  return [
    { key: 'ax', label: 'X', value: mg(a?.x), min: -2000, max: 2000, signed: true, unit: 'mg', decimals: 0 },
    { key: 'ay', label: 'Y', value: mg(a?.y), min: -2000, max: 2000, signed: true, unit: 'mg', decimals: 0 },
    { key: 'az', label: 'Z', value: mg(a?.z), min: -2000, max: 2000, signed: true, unit: 'mg', decimals: 0 },
  ]
})
</script>

<template>
  <div class="dash">
    <!-- Far left: manual / debug controls + emergency surface + subtle reset -->
    <div class="col col-left">
      <EmergencySurfaceButton />
      <div class="dbg-wrap"><DebugCommandsPanel /></div>
      <ResetButton class="reset-pin" />
    </div>

    <!-- Centre stage: fluid gauge row above; model flanked by depth and liveness -->
    <div class="col col-center">
      <div class="gauges">
        <CircularGauge
          v-for="g in gauges"
          :key="g.key"
          :value="g.value"
          :min="g.min"
          :max="g.max"
          :label="g.label"
          :unit="g.unit"
          :signed="g.signed"
          :decimals="g.decimals"
          :trend="g.trend"
        />
      </div>

      <!-- IMU instrument boxes: angular velocity (gyro) and translational
           acceleration, flanking the model area. Compact dials so three fit a
           box; values converted to °/s and mg for display. -->
      <div class="imu-boxes">
        <div class="data-box">
          <div class="data-box-title">Ang Vel</div>
          <div class="box-gauges">
            <CircularGauge
              v-for="g in angVelGauges"
              :key="g.key"
              :value="g.value"
              :min="g.min"
              :max="g.max"
              :label="g.label"
              :unit="g.unit"
              :signed="g.signed"
              :decimals="g.decimals"
              size="compact"
            />
          </div>
        </div>
        <div class="data-box">
          <div class="data-box-title">Trans Acc</div>
          <div class="box-gauges">
            <CircularGauge
              v-for="g in accelGauges"
              :key="g.key"
              :value="g.value"
              :min="g.min"
              :max="g.max"
              :label="g.label"
              :unit="g.unit"
              :signed="g.signed"
              :decimals="g.decimals"
              size="compact"
            />
          </div>
        </div>
      </div>

      <div class="stage">
        <div class="flank flank-left">
          <DepthValveReadout />
        </div>
        <div class="model">
          <button
            class="view-toggle"
            :class="{ active: modelView === 'locked' }"
            @click="toggleModelView"
            :title="modelView === 'locked'
              ? 'Locked to inferred pitch/roll (drag spins yaw). Click for free-look.'
              : 'Free-look orbit. Click to lock to inferred pitch/roll.'"
          >
            {{ modelView === 'locked' ? 'Locked' : 'Free-look' }}
          </button>
          <UUVViewer
            :view-mode="modelView"
            :qx="poseQuat.x"
            :qy="poseQuat.y"
            :qz="poseQuat.z"
            :qw="poseQuat.w"
            :ax="latestImu?.linear_acceleration?.x ?? 0"
            :ay="latestImu?.linear_acceleration?.y ?? 0"
            :az="latestImu?.linear_acceleration?.z ?? 0"
          />
        </div>
        <div class="flank flank-right">
          <SubsystemHealthPanel />
        </div>
      </div>

      <!-- Deploy-time controls: pre-dive initialization + the lifeguard
           dead-man failsafe. -->
      <div class="init-bar">
        <LifeguardToggle />
        <div class="init-sep" aria-hidden="true"></div>
        <DiveInitPanel />
        <div class="init-sep" aria-hidden="true"></div>
        <DbWriterControl />
      </div>
    </div>

    <!-- Right: automatic dive profiles -->
    <div class="col col-right">
      <CommandProfilePanel class="grow" />
    </div>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  gap: 14px;
  /* Bound to the viewport minus the fixed app-bar (v-main's 52px top offset) so
     the columns fit one screen instead of the tallest column's content pushing
     the whole page past the fold and clipping the Reset / Send-Stop footers.
     `height: 100%` can't do this -- v-main is content-sized, so it'd be circular. */
  height: calc(100dvh - 52px);
  width: 100%;
  padding: 14px;
  overflow: hidden;
}

.col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}
.col-left  { flex: 0 0 312px; overflow-y: auto; }
.col-right { flex: 0 0 312px; }
.col-center { flex: 1 1 auto; min-width: 0; }

/* A card inside a column that should absorb the slack (the dive-profile panel,
   whose footer pins Send/Stop to the bottom). */
.col .grow { flex: 1 1 auto; min-height: 0; }

/* The debug card grows to fill the column so it reads as the same large panel
   as the Dive Profile card on the right; Reset sits directly beneath it. */
.dbg-wrap { flex: 1 1 auto; min-height: 0; }

/* ── Gauge row (fluid, reflows as gauges are added) ─────────────────────── */
.gauges {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: center;
  flex: 0 0 auto;
}

/* ── IMU boxes (ang-vel left, accel right; flank the model area) ─────────── */
.imu-boxes {
  display: flex;
  flex: 0 0 auto;
  gap: 14px;
  justify-content: space-between;
  flex-wrap: wrap;
  /* Inset from the column edges so the two groups sit a little further in,
     toward the model, rather than hard against the outer margins. */
  padding: 0 56px;
  /* Nudge the two IMU groups down a touch, off the gauge row above them. */
  margin-top: 12px;
}
/* Transparent: no card chrome, just the title + dials sitting on the page. */
.data-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: transparent;
}
.data-box-title {
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  text-align: center;
}
/* Accent the two titles so they read like the Depth / Subsystems instruments:
   warm gold for angular velocity, purple for acceleration. */
.imu-boxes .data-box:nth-child(1) .data-box-title { color: var(--panel-cmd-accent); }
.imu-boxes .data-box:nth-child(2) .data-box-title { color: var(--panel-subsys-accent); }
.box-gauges {
  display: flex;
  gap: 8px;
  justify-content: center;
}

/* ── Stage: depth | model | liveness ────────────────────────────────────── */
.stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  /* Bottom-align: the cage and both flank panels settle just above the init bar
     instead of floating at the stage's mid-height. The leftover stage height
     opens up as a gap ABOVE the cage (between it and the gauge row), so the gyro
     reads as anchored to the init bar rather than adrift in the middle. */
  align-items: flex-end;
  /* Keep the three pieces clustered centrally with a small fixed gap. On narrow
     laptop columns the flanks (fixed width) can't shrink, so the model claims
     ALL the remaining width regardless of justify-content -- a small gap there
     means the widest possible cage. On wide screens the leftover falls as outer
     margin, so the flanks stay close to the rings rather than drifting to the
     far edges. The gap is the minimum clearance, so they never touch the cage. */
  justify-content: center;
  gap: 32px;
}
.flank {
  flex: 0 0 150px;
  display: flex;
  flex-direction: column;
  /* Match the model's height and bottom edge (the stage is flex-end), then centre
     the panel within it -- so DEPTH / SUBSYSTEMS float level with the gyro's
     vertical centre instead of sinking to the init bar with the cage's low anchor. */
  height: min(100%, 640px);
  justify-content: center;
}
.flank > * { width: 100%; }
.model {
  /* Bottom-anchored (not stretched) so the cage sits LOW, just above the init
     bar, rather than floating at the stage's mid-height. The leftover stage
     height becomes a margin above it. */
  flex: 0 1 auto;
  align-self: flex-end;
  /* The big size lever: a (near-)square canvas lets the camera frame the cage's
     bounding sphere against the canvas HEIGHT, not just its narrow width. The
     old 0.70 portrait canvas pinned the sphere to ~0.6 of the height; a square
     one pushes it to ~0.85+, so the gyro reads markedly larger. Height is capped
     so the gap falls above the cage; on shorter stages it uses the full height. */
  height: min(100%, 640px);
  aspect-ratio: 1;
  max-width: 100%;
  min-width: 0;
  position: relative;
  /* The tilted rings make the cage render ~3.4% of the canvas width right of
     centre. Nudge the canvas left by that fraction so the cage lands on the
     gauge axis above it and the depth/subsystem gaps come out symmetric. */
  transform: translateX(-3.4%);
}

/* Free-look <-> locked toggle, pinned to the model canvas's top-right. Mirrors
   the .unit-toggle styling used elsewhere so it reads as the same control. */
.view-toggle {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  background: var(--bg-btn);
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}
.view-toggle:hover { background: var(--accent-hover-bg); border-color: var(--accent-border); color: var(--accent); }
.view-toggle.active { color: var(--accent); border-color: var(--accent-border); }

/* ── Init bar (bottom of centre column) ─────────────────────────────────── */
/* Deploy-time toolbar; holds the lifeguard toggle. Styled as a horizontal
   console panel so the slot reads as intentional, not a gap. */
.init-bar {
  position: relative;
  flex: 0 0 auto;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 0 16px;
  /* Sharp top-inward trapezoid (SpaceX-console bar). clip-path clips the CSS
     border away on the slanted edges, so the 1px outline is faked with two
     layers: this element carries the border colour and the ::before is the
     panel fill, inset 1px. */
  background: var(--border);
  border-radius: 0;
  clip-path: polygon(48px 0, calc(100% - 48px) 0, 100% 100%, 0 100%);
  transition: background var(--transition);
}
.init-bar::before {
  content: '';
  position: absolute;
  inset: 1px;
  background: var(--bg-panel);
  clip-path: polygon(48px 0, calc(100% - 48px) 0, 100% 100%, 0 100%);
  transition: background var(--transition);
}
/* Small vertical divider between the lifeguard toggle and the dive-init
   controls -- the vertical analogue of the Debug panel's section bars. */
.init-sep {
  position: relative; /* above the init-bar's ::before fill */
  z-index: 1;
  flex: 0 0 auto;
  width: 1px;
  height: 40px;
  background: var(--panel-depth-accent);
}
/* ── Side panels: flat, blended into the page ───────────────────────────── */
/* The two big side instruments drop their card chrome and sit directly on the
   dashboard background; their identity comes from an accent heading underline
   (warm gold left, primary accent right) rather than a box outline. Reaches
   into SimpleCardWrapper's .card-wrap via :deep -- the wrapper itself stays a
   normal card for every other panel. The wrapper's 14px/16px padding is kept
   so content stays flush with the Emergency / Reset buttons (left) and the
   column edge (right). */
.dbg-wrap  :deep(.card-wrap),
.col-right :deep(.card-wrap) {
  background: transparent;
  border: none;
  border-radius: 0;
}

.dbg-wrap :deep(.card-heading) {
  color: var(--panel-cmd-accent);
  font-size: 12px;                                  /* up from the wrapper's 10px */
  border-bottom: 2px solid var(--panel-cmd-border); /* accent underline replaces the box */
  margin-bottom: 12px;                              /* extra breathing room below the underline */
}

.col-right :deep(.card-heading) {
  color: var(--panel-dive-accent);
  font-size: 12px;
  border-bottom: 2px solid var(--panel-dive-border);
  margin-bottom: 16px;  /* a touch more than Debug -- the select's floating label sits high */
}

/* ── Stacked fallback for narrow viewports ──────────────────────────────── */
/* The three-column dashboard needs ~1362px to breathe: the two fixed 312px side
   columns leave the centre just wide enough for the four gauges on ONE row only
   at/above that width. Below it the gauge strip wraps, the stage is starved, and
   the bottom-aligned flank panels poke up into the wrapped gauges. So we stack
   to the single-column scroll layout right where the gauge row stops fitting,
   rather than rendering a pinched, overlapping three-column view. */
@media (max-width: 1361px) {
  .dash {
    flex-direction: column;
    overflow-y: auto;
    /* Stacked layout grows with content and scrolls the page as before. */
    height: auto;
  }
  .col-left,
  .col-right {
    flex: 0 0 auto;
  }
  .col .grow { overflow-y: visible; }
  /* Stacked: revert to full-width rows (the centred float only makes sense in
     the side-by-side desktop stage). */
  .stage { flex-direction: column; align-items: stretch; }
  .flank { flex: 0 0 auto; height: auto; justify-content: flex-start; }
  /* Drop the desktop cage framing (bottom-anchored square + centring nudge) for
     a plain full-width banner canvas. */
  .model {
    align-self: stretch;
    aspect-ratio: auto;
    max-width: none;
    height: 340px;
    transform: none;
  }
}
</style>
