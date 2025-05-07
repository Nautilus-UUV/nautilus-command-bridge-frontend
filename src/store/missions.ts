import {defineStore} from "pinia";
import {Mission, Waypoint} from "@/types/MissionTypes";
import {computed, ref} from "vue";
import {jsonRequest} from "@/assets/api_requests";
import {sendCommand} from "@/store/commands";

export const useMissionStore = defineStore('missions', () => {
  const missions = ref<Mission[]>([]);
  const selectedMissionId = ref<string | null>(null);

  async function loadMissions() {
    const response = await jsonRequest({
      method: 'POST',
      endpoint: '/mission-profiles/load',
    })

    if (!response.ok) {
      return
    }

    const data = await response.json()
    if (!data || data.mission_profiles.length <= 0) {
      return
    }

    selectedMissionId.value = data.mission_profiles[0].mission_id
    missions.value = data.mission_profiles

    // Add a simple id to each waypoint
    missions.value.forEach((mission: Mission) => {
      mission.waypoints.forEach((waypoint: Waypoint, index: number) => {
        waypoint.id = index
      })
    })
  }

  loadMissions();

  const currentMission = computed(() => {
    if (!selectedMissionId.value) {
      return null
    }

    return missions.value.find((mission: Mission) => mission.mission_id === selectedMissionId.value)
  })

  function sendCurrentMission() {
    const mission = currentMission.value
    if (!mission) {
      return
    }

    mission.waypoints.forEach((waypoint: Waypoint) => {
      waypoint.id = undefined
    })

    sendCommand('Mission_Profile', mission)
  }

  async function createMission() {
    const response = await jsonRequest({
      method: 'POST',
      endpoint: '/mission-profiles/create',
      body: {
        name: 'New Mission',
        waypoints: []
      }
    })

    if (!response.ok) {
      return
    }

    const data = await response.json()

    await loadMissions();
    selectedMissionId.value = data.mission_id;
  }

  async function updateMission() {
    const mission = currentMission.value
    if (!mission) {
      return
    }

    mission.waypoints.forEach((waypoint: Waypoint) => {
      waypoint.id = undefined
    })

    const response = await jsonRequest({
      method: 'POST',
      endpoint: '/mission-profiles/update',
      body: mission
    })

    if (!response.ok) {
      return
    }

    await loadMissions();
    selectedMissionId.value = mission.mission_id;
  }

  async function deleteMission() {
    const mission = currentMission.value
    if (!mission) {
      return
    }

    if (missions.value.length <= 1) {
      return
    }

    const response = await jsonRequest({
      method: 'POST',
      endpoint: '/mission-profiles/delete',
      body: {
        mission_id: mission.mission_id
      }
    })

    if (!response.ok) {
      return
    }

    await loadMissions();
  }

  return {
    missions,
    selectedMissionId,
    loadMissions,
    currentMission,
    sendCurrentMission,
    createMission,
    updateMission,
    deleteMission,
  }
})
