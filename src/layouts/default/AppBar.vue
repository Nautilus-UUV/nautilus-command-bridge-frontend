<script lang="ts" setup>
import { useTheme } from '@/composables/useTheme'

// Single-page dashboard: the top bar is just brand + theme toggle. The old nav
// links, Controller/Viewer mode switch, and m/Pa unit toggle are gone (depth
// shows both m and Pa inline on the stage).
const { isDark, toggleTheme } = useTheme()
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

    <v-spacer />

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
