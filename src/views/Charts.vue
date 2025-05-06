<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {AliveLog, DepthLog, LeakageLog, PoseLog, PressureLog} from '@/types/DatabaseTypes'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale
} from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale)

const subData = ref<{
  depths:       DepthLog[]     // `/depth`
  targetDepths: DepthLog[]     // `/target_depth`
  poses:        PoseLog[]      // `/pose`
  pressures:    PressureLog[]  // `/pressure`
  leakages:     LeakageLog[]   // `/leakage`
  alives:       AliveLog[]     // `/alive`
}>({
  depths:       [{ record_datetime: "2025-05-05T17:00:00Z", depth: 0 }],
  targetDepths: [{ record_datetime: "2025-05-05T17:00:00Z", depth: 0 }],
  poses:        [{ record_datetime: "2025-05-05T17:00:00Z", x: 0, y: 0, z: 0, qw: 0, qx: 0, qy: 0, qz: 0 }],
  pressures:    [
    { record_datetime: "2025-05-05T17:00:00Z", pressure: 0.0, location: 'hull' },
    { record_datetime: "2025-03-24T17:00:00Z", pressure: 0.0, location: 'bladder' }
  ],
  leakages:     [{ record_datetime: "2025-05-05T17:00:00Z", has_leak: false }],
  alives:       [{ record_datetime: "2025-05-05T17:00:00Z", is_alive: true }],
})

const latestDepth = computed(() => subData.value.depths.slice(-1)[0]?.depth ?? 0)
const latestTargetDepth = computed(() => subData.value.targetDepths.slice(-1)[0]?.depth ?? 0)
const latestPose = computed(() => subData.value.poses.slice(-1)[0] ?? { x:0, y:0, z:0, qw:0, qx:0, qy:0, qz:0, record_datetime: '' })
const latestTimestamp = computed(() => subData.value.depths.slice(-1)[0]?.record_datetime ?? '')
const hullPressure = computed(() => subData.value.pressures.find(p => p.location === 'hull')?.pressure ?? 0)
const bladderPressure = computed(() => subData.value.pressures.find(p => p.location === 'bladder')?.pressure ?? 0)
const latestLeakage = computed(() => subData.value.leakages.slice(-1)[0]?.has_leak ?? false)
const latestAlive = computed(() => subData.value.alives.slice(-1)[0]?.is_alive ?? false)

let chartInstance: Chart | null = null

onMounted(() => {
  const ctx = document.getElementById('depthChart') as HTMLCanvasElement
  if (!ctx) return
  const labels = Array.from({ length: 31 }, (_, i) => i.toString())
  const depthData = [0, 3, 10, 8, 10, 12, 11, 15, 14, 9, 17, 22, 23, 22, 25, 28, 30, 30, 29, 28, 30, 30, 27, 23, 20, 15, 12, 6, 8, 2, 0].slice(0, 31)

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Depth (m)',
          data: depthData,
          borderColor: 'black',
          backgroundColor: 'rgba(0,0,255,0.2)',
          fill: false,
          tension: 0.2
        }
      ]
    },
    options: {
      scales: {
        x: {
          min: 0,
          max: 30,
          ticks: {
            stepSize: 5
          },
          title: {
            display: true,
            text: 'Time'
          }
        },
        y: {
          min: 0,
          max: 30,
          ticks: {
            stepSize: 5
          },
          title: {
            display: true,
            text: 'Depth'
          }
        }
      },
      responsive: false
    }
  })
})
</script>

<template>
  <div class="app-container">
    <div class="data-grid">
      <div class="item top-left" style="grid-area: 1 / 1;">
        Timestamp: {{ latestTimestamp }}
      </div>
      <div class="item top-center" style="grid-area: 1 / 3;">
        Position: ({{ latestPose.x }}, {{ latestPose.y }}, {{ latestPose.z }})
      </div>
      <div class="item top-right" style="grid-area: 1 / 5;">
        Orientation: (w: {{ latestPose.qw }}, x: {{ latestPose.qx }}, y: {{ latestPose.qy }}, z: {{ latestPose.qz }})
      </div>

      <div class="item mid-left" style="grid-area: 2 / 1;">
        Depth: {{ latestDepth }}
      </div>
      <div class="item mid-center" style="grid-area: 2 / 3;">
        Target Depth: {{ latestTargetDepth }}
      </div>
      <div class="item mid-right" style="grid-area: 2 / 5;">
        Hull Pressure: {{ hullPressure }}
      </div>

      <div class="item bot-left" style="grid-area: 3 / 1;">
        Bladder Pressure: {{ bladderPressure }}
      </div>
      <div class="item bot-center" style="grid-area: 3 / 3;">
        Leakage: {{ latestLeakage ? 'Yes' : 'No' }}
      </div>
      <div class="item bot-right" style="grid-area: 3 / 5;">
        Alive: {{ latestAlive ? 'Yes' : 'No' }}
      </div>
    </div>

    <div class="chart-container">
      <canvas id="depthChart" width="560" height="420"></canvas>
    </div>
  </div>
</template>

<style>
.app-container {
  width: 100%;
  height: 100%;
}

.data-grid {
  display: grid;
  width: 80%;
  height: 70%;
  grid-template-rows: 30% 30% 40%;
  grid-template-columns: 1.2fr 0.2fr 1.2fr 0.2fr 1.2fr;
  align-items: center;
  justify-items: normal;
  row-gap: 2vw;
  column-gap: 0;
  position: absolute;
  top: 28.5%;
  left: 30%;
  transform: scaleX(0.7);
}

.item {
  font-size: 1.48rem;
  font-weight: bold;
  color: black;
  white-space: nowrap;
  margin: 0 0;
}

.top-left, .mid-left, .bot-left,
.top-center, .mid-center, .bot-center,
.top-right, .mid-right, .bot-right {
  text-align: center;
}

.chart-container {
  position: absolute;
  top: 40%;
  left: 0%;
  width: 75%;
  height: 50%;
}
</style>
