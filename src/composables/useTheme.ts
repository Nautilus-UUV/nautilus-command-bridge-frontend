import { ref, watch } from 'vue'

const isDark = ref(
  typeof window !== 'undefined' &&
  (localStorage.getItem('nautilus-theme') === 'dark' ||
    (localStorage.getItem('nautilus-theme') == null &&
     window.matchMedia('(prefers-color-scheme: dark)').matches))
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
