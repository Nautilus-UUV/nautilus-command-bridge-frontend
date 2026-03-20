export interface PathPoint {
  id: number
  x: number
  y: number
  z: number
}

export interface PathSegment {
  segment_id: string
  name: string
  points: PathPoint[]
}

export type DiveProfileType = 'naive' | 'sophisticated'
