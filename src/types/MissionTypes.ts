export interface Waypoint {
  id?: number;
  depth: number;
  pause_duration: number;
}

export interface Mission {
  mission_id: string;
  name: string;
  waypoints: Waypoint[];
}
