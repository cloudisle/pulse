import type { ListenerDataEvent, ListenerErrorEvent, ListenerLifecycleEvent } from '../models/listener'
import type { AppSettings, LogEntry } from '../models'
import {System} from "../models";
import {CreateSystemInput} from "../dto";

export interface IElectronAPI {
  platform: string

  app: {
    getSettings(): Promise<AppSettings>
    updateSettings(data: Partial<AppSettings>): Promise<AppSettings>
    getDataPath(): Promise<string>
  }

  systems: {
    list(): Promise<System[]>
    get(id: string): Promise<System>
    create(data: CreateSystemInput): Promise<System>
    update(data: UpdateSystemInput): Promise<System>
    delete(id: string): Promise<System>
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
