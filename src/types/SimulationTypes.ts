export type SimModelType = 'constant_velocity' | 'waypoint_following' | 'pid_depth'

export interface SimulationConfig {
  model: SimModelType
  speed: number        // m/s
  maxDepth: number     // m
  updateRate: number   // Hz (how often sim refreshes)
  notes: string
}

export interface SimDepthPoint {
  record_datetime: string
  depth: number
}
