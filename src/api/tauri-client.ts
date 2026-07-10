import { TauriCommands } from './commands'

export async function health(): Promise<string> {
  void TauriCommands.health
  return 'ok'
}
