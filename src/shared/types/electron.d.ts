import type { ListenerDataEvent, ListenerErrorEvent, ListenerLifecycleEvent } from '../models'
import type { AppSettings, Environment, LogEntry } from '../models'
import {System} from "../models";
import {CreateEnvInput, CreateSchemaInput, CreateSystemInput, UpdateEnvInput, UpdateSchemaInput} from "../dto";

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

  schemas: {
    list(systemId: string): Promise<Schema[]>
    get(systemId: string, id: string): Promise<Schema>
    create(data: CreateSchemaInput): Promise<Schema>
    update(systemId: string, id: string, data: UpdateSchemaInput): Promise<Schema>
    delete(systemId: string, id: string): Promise<void>
    validate(systemId: string, id: string): Promise<void>
  }

  environments: {
    list(systemId: string): Promise<Environment[]>
    get(systemId: string, id: string): Promise<Environment[]>
    create(data: CreateEnvInput): Promise<Environment>
    update(systemId: string, id: string, data: UpdateEnvInput): Promise<Environment>
    delete(systemId: string, id: string): Promise<void>
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
