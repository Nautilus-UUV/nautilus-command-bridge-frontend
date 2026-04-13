export type CommandTypes = 'Mission_Profile' | 'Start' | 'Stop' | 'Pause' | 'Abort' | 'Adjust_Depth' | 'Set_Pitch' | 'Surface'
export type CommandStatus = 'queued' | 'acknowledged' | 'failed'

export interface Command {
  command_id: string,
  command: CommandTypes,
  status: CommandStatus,
  send_retries: number,
  last_update_datetime: string,
}
