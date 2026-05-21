<script lang="ts" setup>
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTheme } from '@/composables/useTheme'
import { useAppMode } from '@/composables/useAppMode'
import type { AppMode } from '@/composables/useAppMode'
import { useUnits } from '@/composables/useUnits'

const route = useRoute()
const router = useRouter()
const { isDark, toggleTheme } = useTheme()
const { mode, setMode, isViewer } = useAppMode()
const { pressureUnit, togglePressureUnit } = useUnits()

function onModeChange(m: AppMode) {
  setMode(m)
  // If switching to viewer while on a controller-only page, redirect to telemetry
  if (m === 'viewer' && (route.name === 'Commands' || route.name === 'Simulations')) {
    router.push({ name: 'Charts' })
  }
}

// Guard: redirect away from controller-only pages in viewer mode
watch(() => route.name, (name) => {
  if (isViewer.value && (name === 'Commands' || name === 'Simulations')) {
    router.push({ name: 'Charts' })
  }
})
</script>

<template>
  <v-app-bar flat height="52" class="n-appbar px-5">
    <!-- Brand -->
    <v-app-bar-title class="ma-0 pa-0" style="min-width: 0">
      <div class="brand d-flex align-center">
        <v-avatar size="28" class="mr-3">
          <v-img src="@/assets/logo.png" alt="Logo" />
        </v-avatar>
        <span class="brand-name">NAUTILUS</span>
        <span class="brand-sub">Command Bridge</span>
      </div>
    </v-app-bar-title>

    <!-- Nav -->
    <nav class="nav-links">
      <router-link
        :to="{ name: 'Charts' }"
        class="nav-link"
        :class="{ active: route.name === 'Charts' }"
      >
        <v-icon size="12" class="mr-1">mdi-chart-line</v-icon>
        Telemetry
      </router-link>
      <router-link
        v-if="!isViewer"
        :to="{ name: 'Commands' }"
        class="nav-link"
        :class="{ active: route.name === 'Commands' }"
      >
        <v-icon size="12" class="mr-1">mdi-console</v-icon>
        Commands
      </router-link>
      <router-link
        v-if="!isViewer"
        :to="{ name: 'Simulations' }"
        class="nav-link"
        :class="{ active: route.name === 'Simulations' }"
      >
        <v-icon size="12" class="mr-1">mdi-flask-outline</v-icon>
        Simulations
      </router-link>
      <router-link
        :to="{ name: 'Debug' }"
        class="nav-link"
        :class="{ active: route.name === 'Debug' }"
      >
        <v-icon size="12" class="mr-1">mdi-bug-outline</v-icon>
        Debug
      </router-link>
    </nav>

    <!-- Mode selector -->
    <div class="mode-select">
      <button
        class="mode-btn"
        :class="{ active: mode === 'controller' }"
        @click="onModeChange('controller')"
        title="Controller — full control + telemetry"
      >
        <v-icon size="12" class="mr-1">mdi-gamepad-variant-outline</v-icon>
        Controller
      </button>
      <button
        class="mode-btn"
        :class="{ active: mode === 'viewer' }"
        @click="onModeChange('viewer')"
        title="Viewer — read-only telemetry"
      >
        <v-icon size="12" class="mr-1">mdi-eye-outline</v-icon>
        Viewer
      </button>
    </div>

    <!-- Pressure unit toggle (m / Pa). Sensor displays bind to useUnits(). -->
    <button
      class="unit-btn"
      :class="{ active: pressureUnit === 'Pa' }"
      @click="togglePressureUnit"
      :title="pressureUnit === 'm' ? 'Showing depth (m). Click for absolute pressure (Pa).' : 'Showing absolute pressure (Pa). Click for depth (m).'"
    >
      {{ pressureUnit }}
    </button>

    <!-- Theme toggle -->
    <button class="theme-btn" @click="toggleTheme" :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'">
      <v-icon size="15">{{ isDark ? 'mdi-weather-sunny' : 'mdi-weather-night' }}</v-icon>
    </button>
  </v-app-bar>
</template>

<style scoped>
.n-appbar {
  background: var(--bg-appbar) !important;
  border-bottom: 1px solid var(--border-sidebar) !important;
  box-shadow: none !important;
}

/* ── Brand ─────────────────────────────────────────────────────────────── */
.brand { user-select: none; }

.brand-name {
  font-family: var(--font-brand);
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.18em;
  color: var(--text);
  line-height: 1;
}

.brand-sub {
  font-family: var(--font-sub);
  font-weight: 500;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-left: 10px;
  line-height: 1;
}

/* ── Nav ───────────────────────────────────────────────────────────────── */
.nav-links {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 0 16px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  padding: 4px 11px;
  font-family: var(--font-ui);
  font-size: 11.5px;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
  letter-spacing: 0.02em;
}
.nav-link:hover {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--text);
}
.nav-link.active {
  background: var(--accent-active-bg);
  border-color: var(--accent);
  color: var(--accent);
}

/* ── Mode selector ────────────────────────────────────────────────────── */
.mode-select {
  display: flex;
  gap: 4px;
  margin-left: 24px;
  margin-right: 12px;
  flex-shrink: 0;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text-hint);
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
  letter-spacing: 0.02em;
}
.mode-btn:hover {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--text);
}
.mode-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* ── Unit toggle ───────────────────────────────────────────────────────── */
.unit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 30px;
  margin-right: 6px;
  padding: 0 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn);
  color: var(--text-muted);
  transition: background var(--transition), color var(--transition), border-color var(--transition);
  flex-shrink: 0;
}
.unit-btn:hover {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
.unit-btn.active {
  color: var(--text);
  border-color: var(--accent);
}

/* ── Theme button ──────────────────────────────────────────────────────── */
.theme-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-btn);
  border-radius: var(--radius-xs);
  cursor: pointer;
  background: var(--bg-btn);
  color: var(--text-muted);
  transition: background var(--transition), color var(--transition), border-color var(--transition);
  flex-shrink: 0;
}
.theme-btn:hover {
  background: var(--accent-hover-bg);
  border-color: var(--accent-border);
  color: var(--accent);
}
</style>
