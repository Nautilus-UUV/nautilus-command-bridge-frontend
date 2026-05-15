import { ref, computed } from 'vue'

export type AppMode = 'controller' | 'viewer'

const mode = ref<AppMode>(
  (typeof window !== 'undefined' && localStorage.getItem('nautilus-mode') as AppMode) || 'controller'
)

export function useAppMode() {
  function setMode(m: AppMode) {
    mode.value = m
    localStorage.setItem('nautilus-mode', m)
  }

  const isViewer = computed(() => mode.value === 'viewer')

  return { mode, setMode, isViewer }
}
