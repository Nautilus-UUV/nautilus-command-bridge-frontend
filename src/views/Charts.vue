<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Title,
  CategoryScale
} from 'chart.js'
import {useDataLogStore} from "@/store/datalogs";
import {storeToRefs} from "pinia";
import {LineChart} from "vue-chart-3";
import {DateTime} from "luxon";

Chart.register(LineController, LineElement, PointElement, LinearScale, Title, CategoryScale)

const dataLogStore = useDataLogStore()
const { dataLogs } = storeToRefs(dataLogStore);
const { resetLeak } = dataLogStore;

const latestDepth = computed(() => dataLogs.value.depths?.[0]?.depth ?? 0)
const latestTargetDepth = computed(() => dataLogs.value.targetDepths?.[0]?.depth ?? 0)
const latestPose = computed(() => dataLogs.value.poses?.[0] ?? { x:0, y:0, z:0, qw:0, qx:0, qy:0, qz:0, record_datetime: '' })
const latestTimestamp = computed(() => dataLogs.value.depths?.[0]?.record_datetime ?? '')
const hullPressure = computed(() => dataLogs.value.pressures.find(p => p.location === 'hull')?.pressure ?? 0)
const extPressure = computed(() => dataLogs.value.pressures.find(p => p.location === 'ext')?.pressure ?? 0)
const tankPressure = computed(() => dataLogs.value.pressures.find(p => p.location === 'tank')?.pressure ?? 0)
const latestLeakage = computed(() => dataLogs.value.leakages?.[0] ?? null)
const latestAlive = computed(() => dataLogs.value.alives?.every(a => a.is_alive) ?? false)

const newestDepth = computed(() => {
  return dataLogs.value.depths?.slice(0, 30).reverse() ?? []
});

// Use newest 30 datapoints from the data log
const depthData = computed<number[]>(() => newestDepth.value.map(d => -d.depth));

// Set indexes for the x-axis
const labels = computed<string[]>(() => newestDepth.value.map(d => {
  const depth_dt = DateTime.fromISO(d.record_datetime, { zone: 'system' });
  return depth_dt.toFormat('HH:mm:ss.SSS');
}));

const chartData = computed(() => {
  return {
    labels: labels.value,
    datasets: [{
      label: 'Depth (m)',
      data: depthData.value,
      borderColor: 'black',
      backgroundColor: 'rgba(0,0,255,0.2)',
      fill: false,
      tension: 0.2
    }]
  }
})

const chartOptions = ref({
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
      min: -100,
      max: 0,
      ticks: {
        stepSize: 10
      },
      title: {
        display: true,
        text: 'Depth'
      }
    }
  },
  responsive: true
});
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
        Tank Pressure: {{ tankPressure }}
      </div>
      <div class="item bot-center" style="grid-area: 3 / 3;">
        Last Leak : {{ DateTime.fromISO(latestLeakage?.record_datetime, {zone: 'system'}).toFormat('HH:mm:ss.SSS') ?? 'No Data' }} <br/>
        Leakage: {{ latestLeakage?.has_leak ? 'Yes' : 'No' }}
        <v-btn
          variant="outlined"
          icon="mdi-refresh"
          @click="resetLeak"
        />
      </div>
      <div class="item bot-right" style="grid-area: 3 / 5;">
        Ext Pressure: {{ extPressure }}
      </div>
    </div>

    <div class="chart-container">
      <LineChart
        :chartData="chartData"
        style="width: 560px; height: 420px;"
        :options="chartOptions"
      />
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
