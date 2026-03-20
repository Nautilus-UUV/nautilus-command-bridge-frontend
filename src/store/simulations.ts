import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SimulationConfig, SimDepthPoint } from '@/types/SimulationTypes'

export const useSimulationStore = defineStore('simulations', () => {
  const overlayEnabled = ref(false)

  const config = ref<SimulationConfig>({
    model: 'constant_velocity',
    speed: 0.5,
    maxDepth: 50,
    updateRate: 1,
    notes: '',
  })

  // Simulated depth data — populated by backend or client-side model
  const simDepths = ref<SimDepthPoint[]>([])

  // Simulation run status
  const isRunning = ref(false)
  const lastRunAt = ref<string | null>(null)
  const statusMessage = ref('Not started')

  // Stub: send simulation config to backend and start simulation
  async function startSimulation() {
    isRunning.value = true
    statusMessage.value = 'Running…'
    // TODO: POST config to /simulation/start and poll /simulation/depth/load-new
    // For now just mark as running
    lastRunAt.value = new Date().toISOString()
  }

  function stopSimulation() {
    isRunning.value = false
    statusMessage.value = 'Stopped'
    // TODO: POST /simulation/stop
  }

  function clearSimData() {
    simDepths.value = []
    statusMessage.value = 'Cleared'
  }

  return {
    overlayEnabled,
    config,
    simDepths,
    isRunning,
    lastRunAt,
    statusMessage,
    startSimulation,
    stopSimulation,
    clearSimData,
  }
})
