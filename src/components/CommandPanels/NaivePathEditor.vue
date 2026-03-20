<script setup lang="ts">
import { ref } from 'vue'
import { usePathStore } from '@/store/path'
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'

const pathStore = usePathStore()
const { segments, selectedSegmentId, currentSegment } = storeToRefs(pathStore)
const { createSegment, deleteSegment, addPoint, removePoint, exportSegmentCsv, exportAllCsv, importSegmentCsv } = pathStore

const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref('')

function triggerImport() { importError.value = ''; fileInput.value?.click() }

async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try { await importSegmentCsv(file) }
  catch { importError.value = 'Failed to parse CSV. Expected: optional "name,…" row, then "x,y,z" header, then data rows.' }
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
<div class="npe">

  <!-- Header toolbar -->
  <div class="toolbar">
    <span class="toolbar-label">Path Segments</span>
    <div class="spacer" />
    <button class="nb-btn icon-btn" @click="createSegment" title="New segment">
      <v-icon size="12">mdi-plus</v-icon>
    </button>
    <button class="nb-btn icon-btn" @click="triggerImport" title="Import CSV">
      <v-icon size="12">mdi-upload</v-icon>
    </button>
    <button class="nb-btn icon-btn" :disabled="segments.length === 0" @click="exportAllCsv" title="Export all">
      <v-icon size="12">mdi-download-multiple</v-icon>
    </button>
    <input ref="fileInput" type="file" accept=".csv,text/csv" style="display:none" @change="onFileChange" />
  </div>

  <div v-if="importError" class="error-banner">{{ importError }}</div>

  <!-- Segment tabs -->
  <div class="seg-tabs" v-if="segments.length > 0">
    <button
      v-for="seg in segments"
      :key="seg.segment_id"
      class="seg-tab"
      :class="{ active: seg.segment_id === selectedSegmentId }"
      @click="selectedSegmentId = seg.segment_id"
    >{{ seg.name }}</button>
  </div>

  <div v-if="segments.length === 0" class="empty-state">
    No segments — press <strong>+</strong> to create one or <v-icon size="11">mdi-upload</v-icon> to import.
  </div>

  <!-- Segment editor -->
  <div v-if="currentSegment" class="seg-editor">

    <!-- Name + actions -->
    <div class="name-row">
      <input class="name-input" type="text" v-model="currentSegment.name" placeholder="Segment name" />
      <button class="nb-btn" @click="exportSegmentCsv(currentSegment.segment_id)" title="Export as CSV">
        <v-icon size="11" class="mr-1">mdi-download</v-icon>CSV
      </button>
      <button class="nb-btn danger-btn icon-btn" @click="deleteSegment(currentSegment.segment_id)" title="Delete segment">
        <v-icon size="11">mdi-delete</v-icon>
      </button>
    </div>

    <!-- Waypoint table -->
    <div class="table-wrap">
      <table class="wp-table">
        <thead>
          <tr>
            <th style="width:76px">Point</th>
            <th>X <span class="ax-unit">rel</span></th>
            <th>Y <span class="ax-unit">rel</span></th>
            <th>Z <span class="ax-unit">rel</span></th>
            <th style="width:36px"></th>
          </tr>
        </thead>
        <draggable v-model="currentSegment.points" tag="tbody" handle=".dh" item-key="id" ghost-class="row-ghost">
          <template #item="{ element, index }">
            <tr class="wp-row">
              <td>
                <v-icon class="dh mr-1" size="12" style="color:var(--text-hint);cursor:grab">mdi-drag</v-icon>
                <span class="pt-lbl">P{{ index + 1 }}</span>
              </td>
              <td><input class="coord" type="number" step="0.1" v-model="element.x" /></td>
              <td><input class="coord" type="number" step="0.1" v-model="element.y" /></td>
              <td><input class="coord" type="number" step="0.1" v-model="element.z" /></td>
              <td class="text-right">
                <button class="nb-btn icon-btn danger-btn" @click="removePoint(currentSegment.segment_id, element.id)">
                  <v-icon size="10">mdi-close</v-icon>
                </button>
              </td>
            </tr>
          </template>
          <template #footer>
            <tr>
              <td colspan="5" class="add-row">
                <button class="nb-btn" @click="addPoint(currentSegment.segment_id)">
                  <v-icon size="11" class="mr-1">mdi-plus</v-icon>Add Point
                </button>
              </td>
            </tr>
          </template>
        </draggable>
      </table>
    </div>

    <div class="csv-hint">CSV: optional <code>name,…</code> · <code>x,y,z</code> header · data rows</div>
  </div>

</div>
</template>

<style scoped>
.npe {
  display: flex; flex-direction: column; gap: 8px; height: 100%;
}

/* ── Toolbar ─────────────────────────────────────────────────────────── */
.toolbar { display: flex; align-items: center; gap: 5px; }
.toolbar-label { font-family: var(--font-ui); font-size: 11px; font-weight: 500; color: var(--text-muted); }
.spacer { flex: 1; }

/* ── Tabs ────────────────────────────────────────────────────────────── */
.seg-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.seg-tab {
  padding: 3px 10px; font-size: 11px; font-family: var(--font-ui); font-weight: 500;
  border: 1px solid var(--border-btn); border-radius: var(--radius-xs);
  cursor: pointer; background: var(--bg-btn); color: var(--text-muted);
  transition: background var(--transition), color var(--transition);
}
.seg-tab:hover  { background: var(--accent-hover-bg); border-color: var(--accent-border); }
.seg-tab.active { background: var(--accent-active-bg); border-color: var(--accent); color: var(--accent); }

/* ── Editor ──────────────────────────────────────────────────────────── */
.seg-editor { display: flex; flex-direction: column; gap: 7px; flex: 1 1 auto; min-height: 0; }

.name-row { display: flex; align-items: center; gap: 6px; }
.name-input {
  flex: 1; font-size: 12.5px; font-family: var(--font-ui);
  padding: 5px 8px; border: 1px solid var(--border-input);
  border-radius: var(--radius-xs); background: var(--bg-input); color: var(--text);
}
.name-input:focus { outline: none; border-color: var(--accent); }

/* ── Table ────────────────────────────────────────────────────────────── */
.table-wrap {
  flex: 1 1 auto; overflow-y: auto; min-height: 0;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg-panel);
}
.wp-table { width: 100%; border-collapse: collapse; font-family: var(--font-ui); font-size: 12px; }
.wp-table thead th {
  position: sticky; top: 0; background: var(--bg-table-head);
  font-size: 9.5px; font-weight: 600; text-transform: uppercase;
  color: var(--text-muted); letter-spacing: 0.08em;
  padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left;
}
.wp-row td { padding: 4px 8px; border-bottom: 1px solid var(--border-divider); vertical-align: middle; color: var(--text); }
.wp-row:last-child td { border-bottom: none; }
.row-ghost { background: var(--accent-hover-bg) !important; }
.pt-lbl { font-size: 11px; color: var(--text-muted); font-style: italic; }
.ax-unit { font-size: 8.5px; color: var(--text-hint); font-style: italic; margin-left: 2px; }

.coord {
  width: 68px; font-size: 11.5px; font-family: var(--font-mono);
  padding: 3px 5px; border: 1px solid var(--border-input);
  border-radius: var(--radius-xs); background: var(--bg-input);
  text-align: right; color: var(--text);
}
.coord:focus { outline: none; border-color: var(--accent); }

.add-row { padding: 7px; text-align: center; }

/* ── Misc ────────────────────────────────────────────────────────────── */
.empty-state {
  font-family: var(--font-ui); font-size: 11.5px; color: var(--text-hint);
  font-style: italic; padding: 14px 4px;
}
.error-banner {
  font-size: 11px; font-family: var(--font-ui); color: var(--status-err-text);
  background: var(--status-err-bg); border: 1px solid var(--status-err-border);
  border-radius: var(--radius-xs); padding: 6px 10px;
}
.csv-hint { font-size: 9.5px; color: var(--text-hint); font-family: var(--font-ui); }
code {
  font-family: var(--font-mono); font-size: 9.5px;
  background: var(--bg-code); padding: 1px 4px; border-radius: 2px;
}

/* ── Buttons ─────────────────────────────────────────────────────────── */
.nb-btn {
  display: inline-flex; align-items: center;
  padding: 5px 10px; font-size: 11.5px; font-family: var(--font-ui); font-weight: 500;
  border: 1px solid var(--border-btn); border-radius: var(--radius-xs);
  cursor: pointer; background: var(--bg-btn); color: var(--text-btn);
  transition: background var(--transition), border-color var(--transition);
}
.nb-btn:hover   { background: var(--accent-hover-bg); border-color: var(--accent-border); color: var(--accent); }
.nb-btn:active  { background: var(--accent-active-bg); }
.nb-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.icon-btn { padding: 5px 7px; }
.danger-btn { background: var(--status-err-bg); border-color: var(--status-err-border); color: var(--status-err-text); }
.danger-btn:hover { filter: brightness(0.9); }
</style>
