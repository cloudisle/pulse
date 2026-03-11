import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Api } from '../../shared/api'
import { StorageService, StoragePaths } from '../services/storage'
import { SettingsService } from '../services/settings.service'
import type { System, InputConfig, OutputConfig } from '../../shared/models'
import type { CreateSystemInput, UpdateSystemInput } from '../../shared/dto'

export class SystemsApi implements Api {
  readonly api = 'systems'

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService
  ) {}

  async list(): Promise<System[]> {
    const dataDir = await this.settings.getDataPath()
    const systemsDir = path.join(dataDir, 'systems')

    let entries: string[]
    try {
      entries = await this.storage.listDir(systemsDir)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }

    const systems: System[] = []
    for (const entry of entries) {
      const system = await this.storage.read<System>(StoragePaths.system(dataDir, entry))
      if (system !== null) {
        systems.push(system)
      }
    }
    return systems
  }

  async get(id: string): Promise<System> {
    const dataDir = await this.settings.getDataPath()
    const system = await this.storage.read<System>(StoragePaths.system(dataDir, id))
    if (system === null) {
      throw new Error(`System not found: ${id}`)
    }
    return system
  }

  async create(data: CreateSystemInput): Promise<System> {
    const dataDir = await this.settings.getDataPath()
    const id = uuidv4()
    const now = new Date().toISOString()

    const inputs: InputConfig[] = (data.inputs ?? []).map((input) => ({
      ...input,
      id: uuidv4()
    }))

    const outputs: OutputConfig[] = (data.outputs ?? []).map((output) => ({
      ...output,
      id: uuidv4()
    }))

    const system: System = {
      id,
      name: data.name,
      ...(data.description !== undefined && { description: data.description }),
      inputs,
      outputs,
      createdAt: now,
      updatedAt: now
    }

    const systemDir = path.join(dataDir, 'systems', id)
    await this.storage.ensureDir(path.join(systemDir, 'schemas'))
    await this.storage.ensureDir(path.join(systemDir, 'environments'))
    await this.storage.ensureDir(path.join(systemDir, 'profiles'))
    await this.storage.ensureDir(path.join(systemDir, 'custom-types'))
    await this.storage.ensureDir(path.join(systemDir, 'templates'))
    await this.storage.ensureDir(path.join(systemDir, 'sessions'))
    await this.storage.write(StoragePaths.system(dataDir, id), system)

    return system
  }

  async update(id: string, data: UpdateSystemInput): Promise<System> {
    const dataDir = await this.settings.getDataPath()
    const existing = await this.get(id)

    const updated: System = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.inputs !== undefined && { inputs: data.inputs }),
      ...(data.outputs !== undefined && { outputs: data.outputs }),
      updatedAt: new Date().toISOString()
    }

    await this.storage.write(StoragePaths.system(dataDir, id), updated)
    return updated
  }

  async delete(id: string): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    const exists = await this.storage.exists(StoragePaths.system(dataDir, id))
    if (!exists) {
      throw new Error(`System not found: ${id}`)
    }
    await fs.rm(path.join(dataDir, 'systems', id), { recursive: true, force: true })
  }
}
