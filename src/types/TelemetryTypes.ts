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
