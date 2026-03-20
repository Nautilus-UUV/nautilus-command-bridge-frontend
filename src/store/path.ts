import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PathSegment, PathPoint } from '@/types/PathTypes'

function newId() { return crypto.randomUUID() }

export const usePathStore = defineStore('path', () => {
  const segments = ref<PathSegment[]>([])
  const selectedSegmentId = ref<string | null>(null)

  const currentSegment = computed<PathSegment | null>(() =>
    segments.value.find(s => s.segment_id === selectedSegmentId.value) ?? null
  )

  function createSegment() {
    const seg: PathSegment = {
      segment_id: newId(),
      name: `Segment ${segments.value.length + 1}`,
      points: []
    }
    segments.value.push(seg)
    selectedSegmentId.value = seg.segment_id
  }

  function deleteSegment(id: string) {
    const idx = segments.value.findIndex(s => s.segment_id === id)
    if (idx === -1) return
    segments.value.splice(idx, 1)
    if (selectedSegmentId.value === id) {
      selectedSegmentId.value = segments.value[0]?.segment_id ?? null
    }
  }

  function addPoint(segmentId: string) {
    const seg = segments.value.find(s => s.segment_id === segmentId)
    if (!seg) return
    const maxId = seg.points.reduce((m, p) => Math.max(m, p.id), -1)
    seg.points.push({ id: maxId + 1, x: 0, y: 0, z: 0 })
  }

  function removePoint(segmentId: string, pointId: number) {
    const seg = segments.value.find(s => s.segment_id === segmentId)
    if (!seg) return
    const idx = seg.points.findIndex(p => p.id === pointId)
    if (idx !== -1) seg.points.splice(idx, 1)
  }

  // ── CSV export for one segment ───────────────────────────────────────
  function exportSegmentCsv(segmentId: string) {
    const seg = segments.value.find(s => s.segment_id === segmentId)
    if (!seg) return
    const lines = [
      `name,${seg.name}`,
      'x,y,z',
      ...seg.points.map(p => `${p.x},${p.y},${p.z}`)
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${seg.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV export for all segments ──────────────────────────────────────
  function exportAllCsv() {
    const rows = ['segment_name,x,y,z']
    for (const seg of segments.value) {
      for (const p of seg.points) {
        rows.push(`${seg.name},${p.x},${p.y},${p.z}`)
      }
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'all_path_segments.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── CSV import (single segment) ──────────────────────────────────────
  function importSegmentCsv(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

          let name = `Imported ${segments.value.length + 1}`
          let dataStart = 0

          // Optional first row: name,<value>
          if (lines[0].toLowerCase().startsWith('name,')) {
            name = lines[0].split(',').slice(1).join(',').trim()
            dataStart = 1
          }
          // Skip header row "x,y,z"
          if (lines[dataStart]?.toLowerCase().replace(/\s/g, '') === 'x,y,z') {
            dataStart++
          }

          const points: PathPoint[] = []
          let nextId = 0
          for (let i = dataStart; i < lines.length; i++) {
            const parts = lines[i].split(',')
            if (parts.length < 3) continue
            const x = parseFloat(parts[0])
            const y = parseFloat(parts[1])
            const z = parseFloat(parts[2])
            if (isNaN(x) || isNaN(y) || isNaN(z)) continue
            points.push({ id: nextId++, x, y, z })
          }

          const seg: PathSegment = { segment_id: newId(), name, points }
          segments.value.push(seg)
          selectedSegmentId.value = seg.segment_id
          resolve()
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  return {
    segments,
    selectedSegmentId,
    currentSegment,
    createSegment,
    deleteSegment,
    addPoint,
    removePoint,
    exportSegmentCsv,
    exportAllCsv,
    importSegmentCsv,
  }
})
