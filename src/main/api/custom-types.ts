import { randomUUID } from 'crypto'
import path from 'path'
import type { CustomDataType, Schema, SchemaElement } from '@shared/models/schema'
import type { CreateCustomTypeInput, UpdateCustomTypeInput } from '@shared/dto/custom-types'
import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'

export interface DeleteCustomTypeResult {
  warnings: string[]
}

export class CustomTypesApi {

  private readonly settings: SettingsService

  constructor(
    private readonly storage: StorageService,
    settings?: SettingsService
  ) {
    this.settings = settings ?? new SettingsService(storage)
  }

  async list(systemId: string): Promise<CustomDataType[]> {
    const dataDir = await this.settings.getDataPath()
    const customTypesDir = path.join(dataDir, 'systems', systemId, 'custom-types')

    let files: string[]
    try {
      files = await this.storage.listDir(customTypesDir)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }

    const customTypes: CustomDataType[] = []
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const id = file.slice(0, -5)
      const customType = await this.storage.read<CustomDataType>(
        StoragePaths.customType(dataDir, systemId, id)
      )
      if (customType !== null) {
        customTypes.push(customType)
      }
    }
    return customTypes
  }

  async get(systemId: string, id: string): Promise<CustomDataType> {
    const dataDir = await this.settings.getDataPath()
    const customType = await this.storage.read<CustomDataType>(
      StoragePaths.customType(dataDir, systemId, id)
    )
    if (customType === null) {
      throw new Error(`Custom type not found: ${id}`)
    }
    return customType
  }

  async create(data: CreateCustomTypeInput): Promise<CustomDataType> {
    const dataDir = await this.settings.getDataPath()
    const customType: CustomDataType = {
      id: randomUUID(),
      systemId: data.systemId,
      name: data.name,
      baseType: data.baseType,
      defaultStrategy: data.defaultStrategy,
      ...(data.constraints !== undefined && { constraints: data.constraints })
    }
    await this.storage.write(
      StoragePaths.customType(dataDir, data.systemId, customType.id),
      customType
    )
    return customType
  }

  async update(
    systemId: string,
    id: string,
    data: UpdateCustomTypeInput
  ): Promise<CustomDataType> {
    const current = await this.get(systemId, id)
    const dataDir = await this.settings.getDataPath()
    const updated: CustomDataType = {
      ...current,
      ...data
    }
    await this.storage.write(StoragePaths.customType(dataDir, systemId, id), updated)
    return updated
  }

  async delete(systemId: string, id: string): Promise<DeleteCustomTypeResult> {
    const dataDir = await this.settings.getDataPath()
    const warnings = await this.findSchemaReferences(dataDir, systemId, id)
    await this.storage.delete(StoragePaths.customType(dataDir, systemId, id))
    return { warnings }
  }

  private async findSchemaReferences(
    dataDir: string,
    systemId: string,
    customTypeId: string
  ): Promise<string[]> {
    const schemasDir = path.join(dataDir, 'systems', systemId, 'schemas')
    let files: string[]
    try {
      files = await this.storage.listDir(schemasDir)
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw err
    }

    const warnings: string[] = []
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const schemaId = file.slice(0, -5)
      const schema = await this.storage.read<Schema>(
        StoragePaths.schema(dataDir, systemId, schemaId)
      )
      if (schema !== null && this.elementsReferenceType(schema.elements, customTypeId)) {
        warnings.push(`Schema "${schema.name}" references this custom type`)
      }
    }
    return warnings
  }

  private elementsReferenceType(elements: SchemaElement[], customTypeId: string): boolean {
    for (const element of elements) {
      if (element.dataType.customTypeId === customTypeId) {
        return true
      }
      if (element.children && this.elementsReferenceType(element.children, customTypeId)) {
        return true
      }
    }
    return false
  }
}
