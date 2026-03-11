import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { Api } from '../../shared/api'
import { StorageService, StoragePaths } from '../services/storage'
import { SettingsService } from '../services/settings.service'
import type { System, InputConfig, OutputConfig } from '../../shared/models'
import type { Schema, CustomDataType, SchemaElement } from '../../shared/models/schema'
import type { Environment } from '../../shared/models/environment'
import type { Profile } from '../../shared/models/profile'
import type { Template, TemplateFolder } from '../../shared/models/template'
import type { CreateSystemInput, UpdateSystemInput, ExportedSystem } from '../../shared/dto'

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

  async export(id: string): Promise<ExportedSystem> {
    const dataDir = await this.settings.getDataPath()
    const system = await this.get(id)

    const schemas = await this.loadSchemas(dataDir, id)
    const environments = await this.loadEnvironmentsMasked(dataDir, id)
    const profiles = await this.loadProfiles(dataDir, id)
    const templateFolders = await this.loadTemplateFolders(dataDir, id)
    const templates = await this.loadTemplates(dataDir, id)
    const customTypes = await this.loadCustomTypes(dataDir, id)

    return { system, schemas, environments, profiles, templates, templateFolders, customTypes }
  }

  async import(data: ExportedSystem): Promise<System> {
    const dataDir = await this.settings.getDataPath()
    const now = new Date().toISOString()

    // Build ID maps for all entities that are referenced as FKs
    const inputIdMap = new Map<string, string>()
    const newInputs: InputConfig[] = data.system.inputs.map((input) => {
      const newId = uuidv4()
      inputIdMap.set(input.id, newId)
      return { ...input, id: newId }
    })

    const outputIdMap = new Map<string, string>()
    const newOutputs: OutputConfig[] = data.system.outputs.map((output) => {
      const newId = uuidv4()
      outputIdMap.set(output.id, newId)
      return { ...output, id: newId }
    })

    const customTypeIdMap = new Map<string, string>()
    for (const ct of data.customTypes) {
      customTypeIdMap.set(ct.id, uuidv4())
    }

    const schemaIdMap = new Map<string, string>()
    for (const schema of data.schemas) {
      schemaIdMap.set(schema.id, uuidv4())
    }

    const profileIdMap = new Map<string, string>()
    for (const profile of data.profiles) {
      profileIdMap.set(profile.id, uuidv4())
    }

    const folderIdMap = new Map<string, string>()
    for (const folder of data.templateFolders) {
      folderIdMap.set(folder.id, uuidv4())
    }

    const newSystemId = uuidv4()

    // Create new system
    const newSystem: System = {
      ...data.system,
      id: newSystemId,
      inputs: newInputs,
      outputs: newOutputs,
      createdAt: now,
      updatedAt: now
    }

    // Create directory structure
    const systemDir = path.join(dataDir, 'systems', newSystemId)
    await this.storage.ensureDir(path.join(systemDir, 'schemas'))
    await this.storage.ensureDir(path.join(systemDir, 'environments'))
    await this.storage.ensureDir(path.join(systemDir, 'profiles'))
    await this.storage.ensureDir(path.join(systemDir, 'custom-types'))
    await this.storage.ensureDir(path.join(systemDir, 'templates'))
    await this.storage.ensureDir(path.join(systemDir, 'sessions'))

    await this.storage.write(StoragePaths.system(dataDir, newSystemId), newSystem)

    // Persist custom types
    for (const ct of data.customTypes) {
      const newId = customTypeIdMap.get(ct.id)!
      const newCt: CustomDataType = { ...ct, id: newId, systemId: newSystemId }
      await this.storage.write(StoragePaths.customType(dataDir, newSystemId, newId), newCt)
    }

    // Persist schemas (remap customTypeId references in elements)
    for (const schema of data.schemas) {
      const newId = schemaIdMap.get(schema.id)!
      const newSchema: Schema = {
        ...schema,
        id: newId,
        systemId: newSystemId,
        elements: this.remapElements(schema.elements, customTypeIdMap),
        createdAt: now,
        updatedAt: now
      }
      await this.storage.write(StoragePaths.schema(dataDir, newSystemId, newId), newSchema)
    }

    // Persist environments
    for (const env of data.environments) {
      const newId = uuidv4()
      const newEnv: Environment = { ...env, id: newId, systemId: newSystemId, createdAt: now, updatedAt: now }
      await this.storage.write(StoragePaths.environment(dataDir, newSystemId, newId), newEnv)
    }

    // Persist profiles
    for (const profile of data.profiles) {
      const newId = profileIdMap.get(profile.id)!
      const newProfile: Profile = { ...profile, id: newId, systemId: newSystemId, createdAt: now, updatedAt: now }
      await this.storage.write(StoragePaths.profile(dataDir, newSystemId, newId), newProfile)
    }

    // Persist template folders
    const newFolders: TemplateFolder[] = data.templateFolders.map((folder) => ({
      ...folder,
      id: folderIdMap.get(folder.id)!,
      systemId: newSystemId,
      parentId: folder.parentId !== null ? (folderIdMap.get(folder.parentId) ?? folder.parentId) : null
    }))
    if (newFolders.length > 0) {
      await this.storage.write(StoragePaths.templateFolders(dataDir, newSystemId), newFolders)
    }

    // Persist templates (remap schemaId, inputId, profileIds, folderId)
    for (const template of data.templates) {
      const newId = uuidv4()
      const newTemplate: Template = {
        ...template,
        id: newId,
        systemId: newSystemId,
        schemaId: schemaIdMap.get(template.schemaId) ?? template.schemaId,
        inputId: inputIdMap.get(template.inputId) ?? template.inputId,
        profileIds: template.profileIds.map((pid) => profileIdMap.get(pid) ?? pid),
        folderId:
          template.folderId !== null ? (folderIdMap.get(template.folderId) ?? template.folderId) : null,
        createdAt: now,
        updatedAt: now
      }
      await this.storage.write(StoragePaths.template(dataDir, newSystemId, newId), newTemplate)
    }

    return newSystem
  }

  private async loadSchemas(dataDir: string, systemId: string): Promise<Schema[]> {
    const schemasDir = path.join(dataDir, 'systems', systemId, 'schemas')
    const schemas: Schema[] = []
    try {
      const files = await this.storage.listDir(schemasDir)
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const id = file.slice(0, -5)
        const schema = await this.storage.read<Schema>(StoragePaths.schema(dataDir, systemId, id))
        if (schema !== null) schemas.push(schema)
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return schemas
  }

  private async loadEnvironmentsMasked(dataDir: string, systemId: string): Promise<Environment[]> {
    const envDir = path.join(dataDir, 'systems', systemId, 'environments')
    const environments: Environment[] = []
    try {
      const files = await this.storage.listDir(envDir)
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const id = file.slice(0, -5)
        const env = await this.storage.read<Environment>(
          StoragePaths.environment(dataDir, systemId, id)
        )
        if (env !== null) {
          environments.push({
            ...env,
            variables: env.variables.map((v) => (v.sensitive ? { ...v, value: '' } : v))
          })
        }
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return environments
  }

  private async loadProfiles(dataDir: string, systemId: string): Promise<Profile[]> {
    const profilesDir = path.join(dataDir, 'systems', systemId, 'profiles')
    const profiles: Profile[] = []
    try {
      const files = await this.storage.listDir(profilesDir)
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const id = file.slice(0, -5)
        const profile = await this.storage.read<Profile>(StoragePaths.profile(dataDir, systemId, id))
        if (profile !== null) profiles.push(profile)
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return profiles
  }

  private async loadTemplateFolders(dataDir: string, systemId: string): Promise<TemplateFolder[]> {
    return (
      (await this.storage.read<TemplateFolder[]>(StoragePaths.templateFolders(dataDir, systemId))) ?? []
    )
  }

  private async loadTemplates(dataDir: string, systemId: string): Promise<Template[]> {
    const templatesDir = path.join(dataDir, 'systems', systemId, 'templates')
    const templates: Template[] = []
    try {
      const files = await this.storage.listDir(templatesDir)
      for (const file of files.filter((f) => f.endsWith('.json') && f !== 'folders.json')) {
        const id = file.slice(0, -5)
        const template = await this.storage.read<Template>(StoragePaths.template(dataDir, systemId, id))
        if (template !== null) templates.push(template)
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return templates
  }

  private async loadCustomTypes(dataDir: string, systemId: string): Promise<CustomDataType[]> {
    const customTypesDir = path.join(dataDir, 'systems', systemId, 'custom-types')
    const customTypes: CustomDataType[] = []
    try {
      const files = await this.storage.listDir(customTypesDir)
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const id = file.slice(0, -5)
        const ct = await this.storage.read<CustomDataType>(StoragePaths.customType(dataDir, systemId, id))
        if (ct !== null) customTypes.push(ct)
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return customTypes
  }

  private remapElements(
    elements: SchemaElement[],
    customTypeIdMap: Map<string, string>
  ): SchemaElement[] {
    return elements.map((el) => {
      const { customTypeId, type } = el.dataType
      const remappedCustomTypeId =
        customTypeId !== undefined
          ? (customTypeIdMap.get(customTypeId) ?? customTypeId)
          : undefined
      // Remap `type` only when it stores a custom type ID (i.e. when customTypeId is defined)
      const remappedType =
        customTypeId !== undefined ? (customTypeIdMap.get(type) ?? type) : type
      return {
        ...el,
        dataType: {
          ...el.dataType,
          type: remappedType,
          ...(remappedCustomTypeId !== undefined && { customTypeId: remappedCustomTypeId })
        },
        ...(el.children !== undefined && {
          children: this.remapElements(el.children, customTypeIdMap)
        })
      }
    })
  }
}
