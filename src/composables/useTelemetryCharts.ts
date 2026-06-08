// Shared builder for the live strip charts that the Telemetry tab and the
// Commands tab both render. Both pages want the *same* depth / BCU / ACU
// graphs, so the chart-data + options live here once instead of being
// duplicated per view -- mirroring the way uuv_ros_core centralises topic
// definitions on the ROS side.
//
// This is a factory, not a singleton: each call wires its own Y-bound refs
// and the depth-axis unit watcher. So a component gets independent zoom
// state, but all the chart-shaping logic (colours, time labels, stepped
// lines) stays in one place and can never drift between the two tabs.
//
// All four data streams come straight from the telemetry store (fed over
// MQTT-WS by mqtt_bridge_node.py). The components keep ownership of the
// Chart.js registration + <LineChart> rendering; this only produces the
// reactive `data` / `options` they bind.

import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { DateTime } from 'luxon'
import { useTelemetryStore } from '@/store/telemetry'
import { useTheme } from '@/composables/useTheme'
import {
  useUnits,
  ATMOSPHERIC_PA,
  PA_PER_M_ABSOLUTE,
} from '@/composables/useUnits'

// Strip charts show the most recent slice of each ring buffer, oldest-first
// so time runs left-to-right.
const WINDOW = 60

function timeLabels(samples: { recordDatetime: string }[]): string[] {
  return samples.map((p) =>
    DateTime.fromISO(p.recordDatetime, { zone: 'system' }).toFormat('HH:mm:ss'),
  )
}

export function useTelemetryCharts() {
  const { isDark } = useTheme()
  const { pressureUnit, paToDepthM } = useUnits()

  const telemStore = useTelemetryStore()
  const {
    bcuPressure,
    externalPressure,
    bcuRpm,
    bcuValves,
    acuPitch,
    acuRoll,
  } = storeToRefs(telemStore)

  // ── Depth chart (pressure-derived depth over time) ────────────────────
  // Source is the raw external pressure sensor, not the EKF. Unit conversion
  // goes through useUnits() so this strip chart tracks the AppBar Pa/m toggle
  // in lockstep with the numeric readouts.
  //
  // Values stay positive (deeper = bigger number) and the Y axis is rendered
  // reversed so larger values plot lower on the chart -- so "down" still maps
  // to "below" visually while the readouts keep the +down convention:
  //   m  mode -> displayed = depth_m       (surface 0, dive +10)
  //   Pa mode -> displayed = p_abs - ATM   (surface 0, dive +98100)
  // Both modes are linearly related by PA_PER_M_ABSOLUTE, so manual bounds
  // convert cleanly without an atmospheric offset.
  const newestExternalPressure = computed(() =>
    externalPressure.value.slice(0, WINDOW).reverse(),
  )
  const depthValues = computed<number[]>(() => {
    if (pressureUnit.value === 'm') {
      return newestExternalPressure.value.map(
        (p) => Math.round(paToDepthM(p.value) * 100) / 100,
      )
    }
    return newestExternalPressure.value.map((p) => Math.round(p.value - ATMOSPHERIC_PA))
  })
  const depthLabels = computed<string[]>(() => timeLabels(newestExternalPressure.value))

  const depthSeriesLabel = computed(() =>
    pressureUnit.value === 'm' ? 'Depth (m, +down)' : 'Gauge (Pa, atm=0, +down)',
  )
  const depthAxisTitle = computed(() =>
    pressureUnit.value === 'm'
      ? 'Depth (m, +down)'
      : 'Gauge pressure (Pa, atm=0, +down)',
  )

  // Manual Y-axis bounds. `null` means auto-scale. In the signed display the
  // two modes are scalar multiples (m * PA_PER_M_ABSOLUTE = Pa), so bounds
  // convert by a single factor and min/max keep their roles across the toggle.
  // Defaults are stated in meters; if the persisted unit is Pa at boot they are
  // converted so the chart shows the same physical window either way. Bounds
  // are never persisted -- reload reapplies these defaults.
  const DEPTH_DEFAULT_MIN_M = 0
  const DEPTH_DEFAULT_MAX_M = 20
  const initialYMin =
    pressureUnit.value === 'm'
      ? DEPTH_DEFAULT_MIN_M
      : Math.round(DEPTH_DEFAULT_MIN_M * PA_PER_M_ABSOLUTE)
  const initialYMax =
    pressureUnit.value === 'm'
      ? DEPTH_DEFAULT_MAX_M
      : Math.round(DEPTH_DEFAULT_MAX_M * PA_PER_M_ABSOLUTE)
  const depthYMin = ref<number | null>(initialYMin)
  const depthYMax = ref<number | null>(initialYMax)

  watch(pressureUnit, (newUnit, oldUnit) => {
    if (newUnit === oldUnit) return
    const convert = (v: number | null): number | null => {
      if (v === null) return null
      if (newUnit === 'Pa') return Math.round(v * PA_PER_M_ABSOLUTE)
      return Math.round((v / PA_PER_M_ABSOLUTE) * 100) / 100
    }
    depthYMin.value = convert(depthYMin.value)
    depthYMax.value = convert(depthYMax.value)
  })

  function depthReset() {
    depthYMin.value = null
    depthYMax.value = null
  }

  const depthData = computed(() => ({
    labels: depthLabels.value,
    datasets: [
      {
        label: depthSeriesLabel.value,
        data: depthValues.value,
        borderColor: isDark.value ? '#6090d8' : '#4a7fcb',
        backgroundColor: isDark.value ? 'rgba(96,144,216,0.07)' : 'rgba(74,127,203,0.07)',
        fill: true,
        tension: 0,
        stepped: 'before' as const,
        pointRadius: 1,
        pointBackgroundColor: isDark.value ? '#6090d8' : '#4a7fcb',
        borderWidth: 1.5,
      },
    ],
  }))

  const depthOptions = computed(() => ({
    scales: {
      x: {
        ticks: { font: { family: 'Inter, sans-serif', size: 10 }, color: isDark.value ? '#606080' : '#808090', maxRotation: 30, maxTicksLimit: 6 },
        grid: { color: isDark.value ? '#21212e' : '#e8e8ee' },
      },
      y: {
        reverse: true,
        ticks: { font: { family: 'Inter, sans-serif', size: 10 }, color: isDark.value ? '#606080' : '#808090' },
        grid: { color: isDark.value ? '#21212e' : '#e8e8ee' },
        title: { display: true, text: depthAxisTitle.value, font: { family: 'Inter, sans-serif', size: 10 }, color: isDark.value ? '#505060' : '#909090' },
        min: depthYMin.value ?? undefined,
        max: depthYMax.value ?? undefined,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { titleFont: { family: 'Inter, sans-serif', size: 11 }, bodyFont: { family: 'Inter, sans-serif', size: 11 } },
    },
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
  }))

  // ── BCU strip chart (rpm over time) ───────────────────────────────────
  const newestRpm = computed(() => bcuRpm.value.slice(0, WINDOW).reverse())
  const bcuData = computed(() => ({
    labels: timeLabels(newestRpm.value),
    datasets: [
      {
        label: 'BCU RPM',
        data: newestRpm.value.map((p) => p.value),
        borderColor: isDark.value ? '#d09040' : '#c07818',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        stepped: 'before' as const,
        pointRadius: 1,
        borderWidth: 1.5,
      },
    ],
  }))

  // Default range covers the controller's full forward/reverse pump envelope
  // so single-axis spikes stay visible without the chart auto-scaling around
  // them.
  const bcuYMin = ref<number | null>(-4200)
  const bcuYMax = ref<number | null>(4200)
  function bcuReset() {
    bcuYMin.value = null
    bcuYMax.value = null
  }

  const bcuOptions = computed(() => ({
    scales: {
      x: { ticks: { color: isDark.value ? '#606080' : '#808090', maxRotation: 30, maxTicksLimit: 6, font: { size: 10 } } },
      y: {
        ticks: { color: isDark.value ? '#606080' : '#808090', font: { size: 10 } },
        min: bcuYMin.value ?? undefined,
        max: bcuYMax.value ?? undefined,
      },
    },
    plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
  }))

  // BCU readouts. Pitch/roll come over the wire as Int16 in the controller's
  // wire units; valves arrive as a bitmap -- bit 0 = the motor way (operator
  // "Valve 2", the pump flow path), bit 1 = the free/bypass way (operator
  // "Valve 1").
  const latestRpm = computed(() => bcuRpm.value[0]?.value ?? null)
  const latestValves = computed(() => bcuValves.value[0]?.value ?? null)
  const motorValveOpen = computed(() => latestValves.value !== null && (latestValves.value & 1) !== 0)
  const freeValveOpen = computed(() => latestValves.value !== null && (latestValves.value & 2) !== 0)

  // ── ACU strip chart (pitch mm + roll deg) ─────────────────────────────
  const newestPitch = computed(() => acuPitch.value.slice(0, WINDOW).reverse())
  const newestRoll = computed(() => acuRoll.value.slice(0, WINDOW).reverse())
  const acuData = computed(() => ({
    labels: timeLabels(newestPitch.value),
    datasets: [
      {
        label: 'Pitch (mm)',
        data: newestPitch.value.map((p) => p.value),
        borderColor: isDark.value ? '#60c090' : '#3a8c60',
        yAxisID: 'y',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        stepped: 'before' as const,
        pointRadius: 1,
        borderWidth: 1.5,
      },
      {
        label: 'Roll (°)',
        data: newestRoll.value.map((p) => p.value / 100),
        borderColor: isDark.value ? '#c060c0' : '#8c3a8c',
        yAxisID: 'y1',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        stepped: 'before' as const,
        pointRadius: 1,
        borderWidth: 1.5,
        borderDash: [4, 3],
      },
    ],
  }))

  // The chart has two axes (pitch mm on y, roll deg on y1); we only expose
  // controls for the primary pitch axis to keep the panel header from
  // overflowing. Default pitch window spans the trim sled's negative-mm bias
  // range so the operator sees the full physical travel without zoom drift.
  const acuYMin = ref<number | null>(-120)
  const acuYMax = ref<number | null>(0)
  function acuReset() {
    acuYMin.value = null
    acuYMax.value = null
  }

  const acuOptions = computed(() => ({
    scales: {
      x: { ticks: { color: isDark.value ? '#606080' : '#808090', maxRotation: 30, maxTicksLimit: 6, font: { size: 10 } } },
      y: {
        position: 'left',
        title: { display: true, text: 'Pitch (mm)' },
        ticks: { color: isDark.value ? '#606080' : '#808090' },
        min: acuYMin.value ?? undefined,
        max: acuYMax.value ?? undefined,
      },
      y1: { position: 'right', title: { display: true, text: 'Roll (°)' }, grid: { drawOnChartArea: false } },
    },
    plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
  }))

  const latestPitch = computed(() => acuPitch.value[0]?.value ?? null)
  const latestRoll = computed(() => acuRoll.value[0]?.value ?? null)
  const pitchMmText = computed(() =>
    latestPitch.value === null ? '—' : `${latestPitch.value} mm`,
  )
  const rollDegText = computed(() =>
    latestRoll.value === null ? '—' : `${(latestRoll.value / 100).toFixed(2)}°`,
  )

  // ── Tank pressure strip chart (internal bladder pressure) ─────────────
  // This is the BCU's internal tank reading, not a water column, so the
  // depth m-conversion doesn't apply -- it's plotted raw in absolute Pa and
  // ignores the AppBar Pa/m toggle. Auto-scales by default; the operator can
  // pin bounds via the panel header like the other strips.
  const newestTank = computed(() => bcuPressure.value.slice(0, WINDOW).reverse())
  const tankData = computed(() => ({
    labels: timeLabels(newestTank.value),
    datasets: [
      {
        label: 'Tank (Pa)',
        data: newestTank.value.map((p) => p.value),
        borderColor: isDark.value ? '#40b0b0' : '#2a8c8c',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        stepped: 'before' as const,
        pointRadius: 1,
        borderWidth: 1.5,
      },
    ],
  }))

  // Default Y window frames the tank's operating band with 10% headroom on
  // each side. The empty/full endpoints mirror PlantSpec.tank_pressure_empty_pa
  // / tank_pressure_full_pa in nautilus-ros scenarios/spec/rig.py -- the sim
  // BCU bridge maps bladder fill linearly onto that 70-150 kPa band. The
  // frontend can't read the scenario YAML, so these track the canonical
  // defaults; a scenario that overrides those endpoints won't shift the bounds
  // (use the auto button / inputs to re-pin). 'auto' clears back to auto-scale.
  const TANK_EMPTY_PA = 70_000
  const TANK_FULL_PA = 150_000
  const tankYMin = ref<number | null>(Math.round(TANK_EMPTY_PA * 0.9)) // 63000
  const tankYMax = ref<number | null>(Math.round(TANK_FULL_PA * 1.1)) // 165000
  function tankReset() {
    tankYMin.value = null
    tankYMax.value = null
  }

  const tankOptions = computed(() => ({
    scales: {
      x: { ticks: { color: isDark.value ? '#606080' : '#808090', maxRotation: 30, maxTicksLimit: 6, font: { size: 10 } } },
      y: {
        ticks: { color: isDark.value ? '#606080' : '#808090', font: { size: 10 } },
        title: { display: true, text: 'Tank pressure (Pa)', font: { family: 'Inter, sans-serif', size: 10 }, color: isDark.value ? '#505060' : '#909090' },
        min: tankYMin.value ?? undefined,
        max: tankYMax.value ?? undefined,
      },
    },
    plugins: { legend: { display: false } },
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const,
  }))

  const latestTankPa = computed(() => bcuPressure.value[0]?.value ?? null)

  return {
    depth: {
      data: depthData,
      options: depthOptions,
      yMin: depthYMin,
      yMax: depthYMax,
      reset: depthReset,
    },
    bcu: {
      data: bcuData,
      options: bcuOptions,
      yMin: bcuYMin,
      yMax: bcuYMax,
      reset: bcuReset,
      latestRpm,
      motorValveOpen,
      freeValveOpen,
    },
    acu: {
      data: acuData,
      options: acuOptions,
      yMin: acuYMin,
      yMax: acuYMax,
      reset: acuReset,
      pitchMmText,
      rollDegText,
    },
    tank: {
      data: tankData,
      options: tankOptions,
      yMin: tankYMin,
      yMax: tankYMax,
      reset: tankReset,
      latestTankPa,
    },
  }
}
