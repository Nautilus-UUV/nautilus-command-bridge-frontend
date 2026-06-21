// Wire shapes for nautilus/telemetry/* topics, as emitted by
// mqtt_bridge_node.py via rosidl_runtime_py.message_to_ordereddict.
//
// Field names mirror the ROS msg exactly; do not rename. The bridge
// emits Pa in Pa, centidegrees in centidegrees -- presentation layer
// owns the conversion.

export interface RosHeaderStamp { sec: number; nanosec: number }
export interface RosHeader { stamp: RosHeaderStamp; frame_id: string }

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

// geometry_msgs/Pose -- /position/estimation and /position/target
export interface PoseMsg {
  position: Vec3
  orientation: Quat
}

// sensor_msgs/Imu -- /imu/filtered/{left,right}
export interface ImuMsg {
  header: RosHeader
  orientation: Quat
  orientation_covariance: number[]
  angular_velocity: Vec3
  angular_velocity_covariance: number[]
  linear_acceleration: Vec3
  linear_acceleration_covariance: number[]
}

// std_msgs scalars -- BCU/external pressure (Int32), BCU rpm (Int16),
// BCU flow rate (Float32), valves (UInt8), ACU pitch/roll (Int16).
export interface ScalarMsg<T = number> { data: T }

// sensor_msgs/Temperature -- /external/temperature (and /internal/temperature).
// `temperature` is already in Celsius (stm_com applies STM_TEMPERATURE_LSB_C),
// so the dial passes it through with no conversion.
export interface TemperatureMsg {
  header: RosHeader
  temperature: number   // Celsius
  variance: number
}

// Bridge-synthesised mirror of /path + /command. Not a ROS message --
// constructed inside mqtt_bridge_node.py._publish_mission_active().
export type MissionState = 'IDLE' | 'LOADED' | 'RUNNING'
export interface MissionActiveMsg {
  state: MissionState
  mission_id: number | null
  target_pressure_pa?: number
  angle_rad?: number
  n_resurfaces?: number
}

// In-store sample. recordDatetime is ISO-8601; populated from
// header.stamp when present, else the client-side receive time. Keeps
// chart code consistent across streams with and without ROS stamps.
export interface Sample<T> {
  recordDatetime: string
  value: T
}

// Subsystem health -- nautilus/status/liveness (diagnostic_msgs/DiagnosticArray
// from the liveness node) plus the bridge link state.
//
// We key health off each DiagnosticStatus.message ("online"/"offline"), NOT the
// numeric `level`: `level` is a ROS byte that the egress JSON path serialises
// as a control-char string, not a number, so it can't be compared to 0 here.
export type HealthState = 'online' | 'offline' | 'unknown'

// The ten rows the Link & Subsystems panel renders. `tether` is frontend-only
// (derived from the bridge link); the nine glider rows are DiagnosticStatus
// names emitted by py_pkg.liveness.liveness_node.
export type SubsystemId =
  | 'tether'
  | 'acu_pitch'
  | 'acu_roll'
  | 'bcu_pump'
  | 'bcu_valve_1'
  | 'bcu_valve_2'
  | 'imu'
  | 'external_pressure'
  | 'tank_pressure'

// diagnostic_msgs/DiagnosticStatus, trimmed to the fields the UI uses. `level`
// is intentionally omitted -- see HealthState.
export interface DiagnosticStatusMsg {
  name: string
  message: string
  hardware_id: string
}

// diagnostic_msgs/DiagnosticArray on nautilus/status/liveness.
export interface DiagnosticArrayMsg {
  status: DiagnosticStatusMsg[]
}
