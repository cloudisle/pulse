import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import type { Profile, Template } from '@shared/models'
import type { CreateProfileInput, UpdateProfileInput } from '@shared/dto'

export class ProfilesApi {

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService
  ) {}

  async list(systemId: string): Promise<Profile[]> {
    const dataDir = await this.settings.getDataPath()
    const profilesDir = path.join(dataDir, 'systems', systemId, 'profiles')

    let files: string[]
    try {
      files = await this.storage.listDir(profilesDir)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }

    const profiles: Profile[] = []
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const profile = await this.storage.read<Profile>(path.join(profilesDir, file))
      if (profile !== null) {
        profiles.push(profile)
      }
    }

    return profiles
  }

  async get(systemId: string, id: string): Promise<Profile> {
    const dataDir = await this.settings.getDataPath()
    const filePath = StoragePaths.profile(dataDir, systemId, id)
    const profile = await this.storage.read<Profile>(filePath)

    if (profile === null) {
      throw new Error(`Profile not found: ${id}`)
    }

    return profile
  }

  async create(data: CreateProfileInput): Promise<Profile> {
    const dataDir = await this.settings.getDataPath()
    const id = uuidv4()
    const now = new Date().toISOString()

    const profile: Profile = {
      id,
      systemId: data.systemId,
      name: data.name,
      ...(data.description !== undefined ? { description: data.description } : {}),
      overrides: data.overrides,
      createdAt: now,
      updatedAt: now
    }

    await this.storage.write(StoragePaths.profile(dataDir, data.systemId, id), profile)

    return profile
  }

  async update(systemId: string, id: string, data: UpdateProfileInput): Promise<Profile> {
    const current = await this.get(systemId, id)
    const dataDir = await this.settings.getDataPath()

    const updated: Profile = {
      ...current,
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.overrides !== undefined ? { overrides: data.overrides } : {}),
      updatedAt: new Date().toISOString()
    }

    await this.storage.write(StoragePaths.profile(dataDir, systemId, id), updated)

    return updated
  }

  async delete(systemId: string, id: string): Promise<void> {
    const dataDir = await this.settings.getDataPath()

    await this.warnIfReferencedByTemplates(dataDir, systemId, id)

    await this.storage.delete(StoragePaths.profile(dataDir, systemId, id))
  }

  private async warnIfReferencedByTemplates(
    dataDir: string,
    systemId: string,
    profileId: string
  ): Promise<void> {
    const templatesDir = path.join(dataDir, 'systems', systemId, 'templates')

    let files: string[]
    try {
      files = await this.storage.listDir(templatesDir)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return
      }
      throw err
    }

    const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== 'folders.json')
    const templates = await Promise.all(
      jsonFiles.map((f) => this.storage.read<Template>(path.join(templatesDir, f)))
    )
    const referencingTemplates = templates
      .filter((t): t is Template => t !== null && t.profileIds.includes(profileId))
      .map((t) => t.name)

    if (referencingTemplates.length > 0) {
      console.warn(
        `Profile "${profileId}" is referenced by ${referencingTemplates.length} template(s): ${referencingTemplates.join(', ')}. ` +
          'Deleting it may cause those templates to behave unexpectedly.'
      )
    }
  }
}
