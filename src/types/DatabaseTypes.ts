export interface DatabaseLog {
  record_datetime: string; // ISO 8601
  log_id: string; // MongoDB ObjectId
}

export interface DepthLog extends DatabaseLog {
  depth: number;
}

export interface PoseLog extends DatabaseLog {
  x: number;
  y: number;
  z: number;
  qw: number;
  qx: number;
  qy: number;
  qz: number;
}

export type PressureSensorLocations = 'hull' | 'tank' | 'ext'
export interface PressureLog extends DatabaseLog {
  pressure: number;
  location: PressureSensorLocations;
}

export type LeakageSensorLocations = 'front' | 'back'
export interface LeakageLog extends DatabaseLog {
  has_leak: boolean;
  location: LeakageSensorLocations;
}

export interface AliveLog extends DatabaseLog {
  is_alive: boolean;
}
