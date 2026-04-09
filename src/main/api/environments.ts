import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import type { Environment } from '@shared/models'
import {CreateEnvInput, UpdateEnvInput} from "@shared/dto";

export class EnvironmentsApi {

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService
  ) {}

  async list(systemId: string): Promise<Environment[]> {
    const dataDir = await this.settings.getDataPath()
    const envDir = path.join(dataDir, 'systems', systemId, 'environments')

    let files: string[]
    try {
      files = await this.storage.listDir(envDir)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }

    const environments: Environment[] = []
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const env = await this.storage.read<Environment>(path.join(envDir, file))
      if (env !== null) {
        environments.push(env)
      }
    }

    return environments
  }

  async get(systemId: string, id: string): Promise<Environment> {
    const dataDir = await this.settings.getDataPath()
    const filePath = StoragePaths.environment(dataDir, systemId, id)
    const env = await this.storage.read<Environment>(filePath)

    if (env === null) {
      throw new Error(`Environment not found: ${id}`)
    }

    return env
  }

  async create(data: CreateEnvInput): Promise<Environment> {
    const dataDir = await this.settings.getDataPath()
    const id = uuidv4()
    const now = new Date().toISOString()

    const env: Environment = {
      id,
      systemId: data.systemId,
      name: data.name,
      variables: data.variables,
      createdAt: now,
      updatedAt: now
    }

    await this.storage.write(StoragePaths.environment(dataDir, data.systemId, id), env)

    return env
  }

  async update(systemId: string, id: string, data: UpdateEnvInput): Promise<Environment> {
    const current = await this.get(systemId, id)
    const dataDir = await this.settings.getDataPath()

    const updated: Environment = {
      ...current,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.variables !== undefined ? { variables: data.variables } : {}),
      updatedAt: new Date().toISOString()
    }

    await this.storage.write(StoragePaths.environment(dataDir, systemId, id), updated)

    return updated
  }

  async delete(systemId: string, id: string): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    await this.storage.delete(StoragePaths.environment(dataDir, systemId, id))
  }
}
