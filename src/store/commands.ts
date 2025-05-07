import {defineStore} from "pinia";
import {ref} from "vue";
import {Command, CommandTypes} from "@/types/CommandsTypes";
import {jsonRequest} from "@/assets/api_requests";

export function sendCommand(commandType: CommandTypes, data: any = null) {
  const body : {
    command: CommandTypes,
    data?: any,
  } = {
    command: commandType,
  }

  if (data) {
    body.data = data
  }

  return jsonRequest({
    method: 'POST',
    endpoint: '/commands/create',
    body: body
  })
}

export const useCommandStore = defineStore('commands', () => {
  const commands = ref<Command[] | null>(null);
  const commandIdSet = ref<Set<string>>(new Set());

  async function baseLoad () {
    const response = await jsonRequest({
      method: 'POST',
      endpoint: '/commands/load',
    })

    if (!response.ok) {
      return
    }

    const data = await response.json()
    if (!data || data.length <= 0) {
      return
    }

    // Sort by the newest last_update_datetime first
    data.sort((a: Command, b: Command) => {
      const aDate = new Date(a.last_update_datetime)
      const bDate = new Date(b.last_update_datetime)
      return bDate.getTime() - aDate.getTime()
    });
    commands.value = data
    commandIdSet.value = new Set(data.map((command: Command) => command.command_id))
  }

  baseLoad();

  function insertCommands (newCommands: Command[]) {
    if (!commands.value) {
      commands.value = []
    }

    for (const command of newCommands) {
      if (commandIdSet.value.has(command.command_id)) {
        // If the command already exists, we remove it from the list, so we can insert it again
        // in the right position

        const index = commands.value.findIndex((c) => c.command_id === command.command_id)
        if (index !== -1) {
          commands.value.splice(index, 1)
        }
      }

      const index = commands.value.findIndex((c) => {
        return new Date(c.last_update_datetime).getTime() < new Date(command.last_update_datetime).getTime()
      })
      if (index === -1) {
        // Check if the command needs to be inserted at the end of the list or front
        if (commands.value.length > 0) {
          const lastCommand = commands.value[commands.value.length - 1]
          if (new Date(lastCommand.last_update_datetime).getTime() < new Date(command.last_update_datetime).getTime()) {
            commands.value.push(command)
          } else {
            commands.value.unshift(command)
          }
        } else {
          commands.value.push(command)
        }
      } else {
        commands.value.splice(index, 0, command)
      }
      commandIdSet.value.add(command.command_id)
    }
  }

  //@ts-ignore
  async function extendedLoad({ done }) {
    if (!commands.value) {
      commands.value = []
    }

    const response = await jsonRequest({
      method: 'POST',
      endpoint: '/commands/load',
      params: {
        skip: commands.value.length.toString(),
      }
    })

    if (!response.ok) {
      done('error')
    }

    const data = await response.json()
    if (!data) {
      done('error')
      return
    }
    if (data.length <= 0) {
      done('empty')
      return
    }

    insertCommands(data)
    done('ok')
  }

  async function checkForNew() {
    if (!commands.value) {
      return
    }

    const response = await jsonRequest({
      method: 'POST',
      endpoint: '/commands/load-new',
      body: {
        last_update_datetime: commands.value[0].last_update_datetime,
      }
    })

    if (!response.ok) {
      return
    }

    const data = await response.json()
    if (!data) {
      return
    }
    if (data.length <= 0) {
      return
    }

    insertCommands(data)
  }

  setInterval(checkForNew, 50000)

  return {
    commands,
    commandIdSet,
    baseLoad,
    insertCommands,
    extendedLoad,
  }
});
