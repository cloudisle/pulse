import type { AppSettings } from '../models/settings'
import type { ListenerDataEvent, ListenerErrorEvent, ListenerLifecycleEvent } from '../models/listener'
import type { LogEntry } from '../models/log'

export interface IElectronAPI {
  platform: string

  app: {
    getSettings(): Promise<AppSettings>
    updateSettings(data: Partial<AppSettings>): Promise<AppSettings>
    getDataPath(): Promise<string>
  }

  listeners: {
    onLifecycle(callback: (event: ListenerLifecycleEvent) => void): () => void
    onData(callback: (event: ListenerDataEvent) => void): () => void
    onError(callback: (event: ListenerErrorEvent) => void): () => void
  }

  log: {
    onEntry(callback: (entry: LogEntry) => void): () => void
  }
}
