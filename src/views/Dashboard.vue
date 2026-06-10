<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTelemetryStore } from '@/store/telemetry'
import { trendOf } from '@/composables/useTrend'

import CircularGauge from '@/components/CircularGauge.vue'
import DepthValveReadout from '@/components/DepthValveReadout.vue'
import UUVViewer from '@/components/UUVViewer.vue'
import EmergencySurfaceButton from '@/components/CommandPanels/EmergencySurfaceButton.vue'
import DebugCommandsPanel from '@/components/CommandPanels/DebugCommandsPanel.vue'
import ResetButton from '@/components/CommandPanels/ResetButton.vue'
import SubsystemHealthPanel from '@/components/CommandPanels/SubsystemHealthPanel.vue'
import CommandProfilePanel from '@/components/CommandPanels/CommandProfilePanel.vue'

// Live values read straight from the telemetry store (MQTT-fed). The gauge row
// is data-driven: each entry is a self-contained spec, so adding a temperature
// dial (or any future metric) is one more object here + its accessor -- the
// fluid flex-wrap container reflows on its own. Ranges are grounded in
// robot_specs.py (BCU_MOTOR_MAX_RPM, ACU_PITCH_MAX_TRAVEL_M, ACU_ROLL_MAX_ANGLE).
const { bcuRpm, acuPitch, acuRoll, bcuPressure } = storeToRefs(useTelemetryStore())

const latest = (s: { value: { value: number }[] }) => s.value[0]?.value ?? null

const gauges = computed(() => {
  const rollRaw = latest(acuRoll)
  const tankRaw = latest(bcuPressure)
  // Order: the two BCU dials operators watch most (pump output + tank pressure)
  // lead, then the ACU attitude pair.
  return [
    {
      key: 'rpm',
      label: 'Pump RPM',
      value: latest(bcuRpm),
      min: -4000, max: 4000, signed: true, unit: 'rpm', decimals: 0,
      trend: trendOf(bcuRpm.value, { back: 5, eps: 20 }),
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

      <div class="stage">
        <div class="flank flank-left">
          <DepthValveReadout />
        </div>
        <div class="model">
          <UUVViewer />
        </div>
        <div class="flank flank-right">
          <SubsystemHealthPanel />
        </div>
      </div>

      <!-- Reserved for initialization commands -- empty placeholder for now,
           to be filled in a later pass. -->
      <div class="init-bar">
        <span class="init-cap">Initialization</span>
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

/* ── Init bar (bottom of centre column) ─────────────────────────────────── */
/* Empty placeholder that later holds initialization commands. Styled as a
   horizontal toolbar panel so the slot reads as intentional, not a gap. */
.init-bar {
  position: relative;
  flex: 0 0 auto;
  min-height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
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
.init-cap {
  position: relative; /* above the ::before fill */
  z-index: 1;
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-hint);
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
