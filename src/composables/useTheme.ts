import { ref, watch } from 'vue'

// Default to dark: the mission-control dashboard is designed dark-first, so a
// fresh client (no stored preference) boots into it regardless of OS setting.
// An explicit 'light' choice still sticks via localStorage.
const isDark = ref(
  typeof window === 'undefined' ||
  localStorage.getItem('nautilus-theme') !== 'light'
)

function applyTheme() {
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  localStorage.setItem('nautilus-theme', isDark.value ? 'dark' : 'light')
}

// Apply on init
if (typeof window !== 'undefined') applyTheme()

watch(isDark, applyTheme)

export function useTheme() {
  function toggleTheme() {
    isDark.value = !isDark.value
  }
  return { isDark, toggleTheme }
}
