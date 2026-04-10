import { randomUUID } from 'crypto'
import path from 'path'
import type { Schema, SchemaElement } from '@shared/models/schema'
import type { ValidationResult, ValidationWarning } from '@shared/models/event'
import type { CreateSchemaInput, UpdateSchemaInput } from '@shared/dto/schemas'
import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'

export class SchemasApi {

  private readonly settings: SettingsService

  constructor(
    private readonly storage: StorageService,
    settings?: SettingsService
  ) {
    this.settings = settings ?? new SettingsService(storage)
  }

  async list(systemId: string): Promise<Schema[]> {
    const dataDir = await this.settings.getDataPath()
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

    const schemas: Schema[] = []
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const id = file.slice(0, -5)
      const schema = await this.storage.read<Schema>(StoragePaths.schema(dataDir, systemId, id))
      if (schema !== null) {
        schemas.push(schema)
      }
    }
    return schemas
  }

  async get(systemId: string, id: string): Promise<Schema> {
    const dataDir = await this.settings.getDataPath()
    const schema = await this.storage.read<Schema>(StoragePaths.schema(dataDir, systemId, id))
    if (schema === null) {
      throw new Error(`Schema not found: ${id}`)
    }
    return schema
  }

  async create(data: CreateSchemaInput): Promise<Schema> {
    const dataDir = await this.settings.getDataPath()
    const now = new Date().toISOString()
    const schema: Schema = {
      id: randomUUID(),
      systemId: data.systemId,
      name: data.name,
      description: data.description,
      elements: data.elements,
      createdAt: now,
      updatedAt: now
    }
    await this.storage.write(StoragePaths.schema(dataDir, data.systemId, schema.id), schema)
    return schema
  }

  async update(systemId: string, id: string, data: UpdateSchemaInput): Promise<Schema> {
    const current = await this.get(systemId, id)
    const dataDir = await this.settings.getDataPath()
    const updated: Schema = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString()
    }
    await this.storage.write(StoragePaths.schema(dataDir, systemId, id), updated)
    return updated
  }

  async delete(systemId: string, id: string): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    await this.storage.delete(StoragePaths.schema(dataDir, systemId, id))
  }

  async validate(systemId: string, id: string): Promise<ValidationResult> {
    const schema = await this.get(systemId, id)
    const dataDir = await this.settings.getDataPath()
    const customTypeIds = await this.loadCustomTypeIds(dataDir, systemId)
    const warnings: ValidationWarning[] = []
    this.validateElements(schema.elements, '', customTypeIds, warnings)
    return {
      valid: true, // schema validation only produces warnings, never errors
      warnings
    }
  }

  private async loadCustomTypeIds(dataDir: string, systemId: string): Promise<Set<string>> {
    const customTypesDir = path.join(dataDir, 'systems', systemId, 'custom-types')
    try {
      const files = await this.storage.listDir(customTypesDir)
      return new Set(files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)))
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return new Set()
      }
      throw err
    }
  }

  private validateElements(
    elements: SchemaElement[],
    parentPath: string,
    customTypeIds: Set<string>,
    warnings: ValidationWarning[]
  ): void {
    for (const element of elements) {
      const elementPath = parentPath ? `${parentPath}.${element.name}` : element.name

      // Check: required fields have generation strategies
      if (element.required && (!element.generationStrategy || !element.generationStrategy.type)) {
        warnings.push({
          elementPath,
          message: `Required field "${element.name}" has no generation strategy`,
          severity: 'warning'
        })
      }

      // Check: custom type references exist
      if (element.dataType.customTypeId && !customTypeIds.has(element.dataType.customTypeId)) {
        warnings.push({
          elementPath,
          message: `Custom type "${element.dataType.customTypeId}" does not exist`,
          severity: 'warning'
        })
      }

      // Check: constraint patterns are valid regex
      if (element.constraints?.pattern) {
        try {
          new RegExp(element.constraints.pattern)
        } catch {
          warnings.push({
            elementPath,
            message: `Constraint pattern "${element.constraints.pattern}" is not a valid regular expression`,
            severity: 'warning'
          })
        }
      }

      // Check: enum values match type
      if (element.constraints?.enum && element.constraints.enum.length > 0) {
        const expectedType = element.dataType.type
        for (const value of element.constraints.enum) {
          if (!this.valueMatchesType(value, expectedType)) {
            warnings.push({
              elementPath,
              message: `Enum value "${value}" does not match type "${expectedType}"`,
              severity: 'warning'
            })
            break // only warn once per element
          }
        }
      }

      // Recursively validate children
      if (element.children && element.children.length > 0) {
        this.validateElements(element.children, elementPath, customTypeIds, warnings)
      }
    }
  }

  private valueMatchesType(value: unknown, type: string): boolean {
    switch (type) {
      case 'string':
        return typeof value === 'string'
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value)
      case 'number':
        return typeof value === 'number'
      case 'boolean':
        return typeof value === 'boolean'
      case 'null':
        return value === null
      default:
        return true // custom types or object/array — cannot type-check enum values
    }
  }
}
