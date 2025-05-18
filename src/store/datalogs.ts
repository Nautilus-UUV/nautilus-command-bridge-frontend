import {defineStore} from "pinia";
import {AliveLog, DepthLog, LeakageLog, PoseLog, PressureLog} from "@/types/DatabaseTypes";
import {ref} from "vue";
import {jsonRequest} from "@/assets/api_requests";

interface storedDataLogs {
  depths: DepthLog[]
  targetDepths: DepthLog[]
  poses: PoseLog[]
  pressures: PressureLog[]
  leakages: LeakageLog[]
  alives: AliveLog[]
}

// Map the keys of storedDataLogs to the endpoint names
const dataLogEndpoint : Record<keyof storedDataLogs, string> = {
  depths: '/depth',
  targetDepths: '/target_depth',
  poses: '/pose',
  pressures: '/pressure',
  leakages: '/leakage',
  alives: '/alive'
}

export const useDataLogStore = defineStore('dataLogs', () => {
  const dataLogs = ref<storedDataLogs>({
    depths: [],
    targetDepths: [],
    poses: [],
    pressures: [],
    leakages: [],
    alives: []
  });

  async function loadDataLogs() {
    for (const [key, endpoint] of Object.entries(dataLogEndpoint)) {
      const response = await jsonRequest({
        method: 'POST',
        endpoint: `${endpoint}/load`,
      })
      if (!response.ok) {
        console.error(`Failed to fetch ${key}:`, response.statusText);
        continue;
      }
      const data = await response.json();
      if (!data || data.length <= 0) {
        console.error(`No data found for ${key}`);
        continue;
      }
      dataLogs.value[key as keyof storedDataLogs] = data;
    }
  }

  loadDataLogs();

  async function checkForNewData() {
    for (const [key , endpoint] of Object.entries(dataLogEndpoint)) {
      let response;
      if (!dataLogs.value[key] || dataLogs.value[key].length <= 0) {
        response = await jsonRequest({
          method: 'POST',
          endpoint: `${endpoint}/load`,
        });
      } else {
        response = await jsonRequest({
          method: 'POST',
          endpoint: `${endpoint}/load-new`,
          body: {
            record_datetime: dataLogs.value[key][0].record_datetime,
          }
        });
      }
      if (!response.ok) {
        console.error(`Failed to fetch ${key}:`, response.statusText);
        continue;
      }
      const data = await response.json();

      if (!data || data.length <= 0) {
        continue;
      }

      // Add the new data to the beginning of the array and limit the size to 100
      dataLogs.value[key].unshift(...data);
      dataLogs.value[key] = dataLogs.value[key as keyof storedDataLogs].slice(0, 100);
    }
  }

  function resetLeak () {
    // TODO: Make better
    // Resets the leak data to the latest value, and sets the leak to false
    // This is a temporary solution as Jannick came to testing without the intention of programming

    dataLogs.value.leakages = dataLogs.value.leakages.slice(0, 1) ?? [];
    dataLogs.value.leakages[0].has_leak = false;
  }

  // Call checkForNewData every 5 seconds
  setInterval( checkForNewData, 5000);

  return {
    dataLogs,
    loadDataLogs,
    checkForNewData,
    resetLeak
  }
})
