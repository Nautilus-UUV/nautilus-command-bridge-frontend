// Singleton operator-units preference: meters vs pascals for pressure
// streams on the Telemetry tab. Mirrors the useTheme.ts pattern -- one
// module-level ref, persisted to localStorage, applied via watch.
//
// Hydrostatic conversion follows physics.py in py_pkg: depth = (P_abs - P_atm)
// / (rho * g) with salt-water density. This matches what the controllers
// reason about, so a depth reading in the UI corresponds to the value the
// EKF / depth_node sees internally.
//
// Note: the existing CommandProfilePanel.vue uses a gauge-Pa / fresh-water
// gradient for the *setpoint* fields (target_pressure_pa is gauge). That
// toggle is intentionally local to that panel; this composable is for
// absolute-Pa sensor readings (EXTERNAL_PRESSURE, BCU_PRESSURE).

import { ref, watch } from 'vue'

export const ATMOSPHERIC_PA = 101_325
export const WATER_DENSITY_KG_M3 = 1025  // salt water
export const GRAVITY_M_S2 = 9.806
export const PA_PER_M_ABSOLUTE = WATER_DENSITY_KG_M3 * GRAVITY_M_S2

export type PressureUnit = 'Pa' | 'm'

const STORAGE_KEY = 'nautilus-pressure-unit'

function loadInitial(): PressureUnit {
  if (typeof window === 'undefined') return 'm'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'Pa' || v === 'm' ? v : 'm'
}

const pressureUnit = ref<PressureUnit>(loadInitial())

watch(pressureUnit, (v) => {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, v)
})

// Absolute Pa -> depth m. Negative for above-atmosphere readings (sensor
// noise at the surface). Caller decides how to clamp/format.
export function paToDepthM(absolutePa: number): number {
  return (absolutePa - ATMOSPHERIC_PA) / PA_PER_M_ABSOLUTE
}

export function depthMToPa(m: number): number {
  return ATMOSPHERIC_PA + m * PA_PER_M_ABSOLUTE
}

// Single point of formatting -- callers feed an absolute Pa and get back
// a number + unit string driven by the active toggle. Two-decimal m and
// integer Pa keep the readout stable as the value jitters.
export function formatPressure(absolutePa: number): { value: number; unit: PressureUnit } {
  if (pressureUnit.value === 'Pa') {
    return { value: Math.round(absolutePa), unit: 'Pa' }
  }
  return { value: Math.round(paToDepthM(absolutePa) * 100) / 100, unit: 'm' }
}

export function useUnits() {
  function togglePressureUnit(): void {
    pressureUnit.value = pressureUnit.value === 'm' ? 'Pa' : 'm'
  }
  return {
    pressureUnit,
    togglePressureUnit,
    paToDepthM,
    depthMToPa,
    formatPressure,
  }
}
