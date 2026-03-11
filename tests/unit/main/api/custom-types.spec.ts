import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { StorageService, StoragePaths } from '../../../../src/main/services/storage'
import { SettingsService } from '../../../../src/main/services/settings.service'
import { CustomTypesApi } from '../../../../src/main/api/custom-types'
import type { DeleteCustomTypeResult } from '../../../../src/main/api/custom-types'
import type { CustomDataType } from '../../../../src/shared/models/schema'
import type { CreateCustomTypeInput, UpdateCustomTypeInput } from '../../../../src/shared/dto/custom-types'

let tmpDir: string
let storage: StorageService
let api: CustomTypesApi

const SYS_ID = 'sys-1'

const BASE_INPUT: CreateCustomTypeInput = {
  systemId: SYS_ID,
  name: 'PhoneNumber',
  baseType: 'string',
  defaultStrategy: { type: 'pattern', config: { pattern: '\\d{3}-\\d{3}-\\d{4}' } }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-custom-types-test-'))
  storage = new StorageService()
  const settings = new SettingsService(storage, tmpDir)
  api = new CustomTypesApi(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('CustomTypesApi — create', () => {
  it('returns a CustomDataType with a generated id', async () => {
    const result = await api.create(BASE_INPUT)

    expect(result.id).toBeTruthy()
    expect(typeof result.id).toBe('string')
  })

  it('persists the custom type to disk', async () => {
    const result = await api.create(BASE_INPUT)

    const filePath = StoragePaths.customType(tmpDir, SYS_ID, result.id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as CustomDataType

    expect(persisted.name).toBe('PhoneNumber')
    expect(persisted.id).toBe(result.id)
  })

  it('stores the systemId on the returned object', async () => {
    const result = await api.create(BASE_INPUT)

    expect(result.systemId).toBe(SYS_ID)
  })

  it('stores the baseType and name', async () => {
    const result = await api.create(BASE_INPUT)

    expect(result.name).toBe('PhoneNumber')
    expect(result.baseType).toBe('string')
  })

  it('persists a pattern strategy correctly', async () => {
    const result = await api.create(BASE_INPUT)

    expect(result.defaultStrategy.type).toBe('pattern')
    expect((result.defaultStrategy.config as { pattern: string }).pattern).toBe(
      '\\d{3}-\\d{3}-\\d{4}'
    )
  })

  it('persists a faker strategy correctly', async () => {
    const input: CreateCustomTypeInput = {
      systemId: SYS_ID,
      name: 'FirstName',
      baseType: 'string',
      defaultStrategy: { type: 'faker', config: { method: 'person.firstName', locale: 'en' } }
    }
    const result = await api.create(input)

    expect(result.defaultStrategy.type).toBe('faker')
    expect((result.defaultStrategy.config as { method: string; locale?: string }).method).toBe(
      'person.firstName'
    )
    expect((result.defaultStrategy.config as { method: string; locale?: string }).locale).toBe('en')
  })

  it('persists a range strategy correctly', async () => {
    const input: CreateCustomTypeInput = {
      systemId: SYS_ID,
      name: 'Age',
      baseType: 'integer',
      defaultStrategy: { type: 'range', config: { min: 18, max: 99, step: 1 } }
    }
    const result = await api.create(input)

    expect(result.defaultStrategy.type).toBe('range')
    const config = result.defaultStrategy.config as { min: number; max: number; step?: number }
    expect(config.min).toBe(18)
    expect(config.max).toBe(99)
    expect(config.step).toBe(1)
  })

  it('persists an enum strategy correctly', async () => {
    const input: CreateCustomTypeInput = {
      systemId: SYS_ID,
      name: 'Status',
      baseType: 'string',
      defaultStrategy: { type: 'enum', config: { values: ['active', 'inactive', 'pending'] } }
    }
    const result = await api.create(input)

    expect(result.defaultStrategy.type).toBe('enum')
    expect((result.defaultStrategy.config as { values: string[] }).values).toEqual([
      'active',
      'inactive',
      'pending'
    ])
  })

  it('persists a constant strategy correctly', async () => {
    const input: CreateCustomTypeInput = {
      systemId: SYS_ID,
      name: 'CountryCode',
      baseType: 'string',
      defaultStrategy: { type: 'constant', config: { value: 'US' } }
    }
    const result = await api.create(input)

    expect(result.defaultStrategy.type).toBe('constant')
    expect((result.defaultStrategy.config as { value: unknown }).value).toBe('US')
  })

  it('persists a template strategy correctly', async () => {
    const input: CreateCustomTypeInput = {
      systemId: SYS_ID,
      name: 'OrderId',
      baseType: 'string',
      defaultStrategy: { type: 'template', config: { template: 'ORD-{{ uuid }}' } }
    }
    const result = await api.create(input)

    expect(result.defaultStrategy.type).toBe('template')
    expect((result.defaultStrategy.config as { template: string }).template).toBe('ORD-{{ uuid }}')
  })

  it('persists constraints when provided', async () => {
    const input: CreateCustomTypeInput = {
      ...BASE_INPUT,
      constraints: { minLength: 12, maxLength: 12, pattern: '\\d{3}-\\d{3}-\\d{4}' }
    }
    const result = await api.create(input)

    expect(result.constraints).toEqual({
      minLength: 12,
      maxLength: 12,
      pattern: '\\d{3}-\\d{3}-\\d{4}'
    })
  })

  it('does not include constraints key when not provided', async () => {
    const result = await api.create(BASE_INPUT)

    expect(result.constraints).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('CustomTypesApi — list', () => {
  it('returns an empty array when no custom types exist', async () => {
    const result = await api.list(SYS_ID)

    expect(result).toEqual([])
  })

  it('returns all created custom types for a system', async () => {
    await api.create(BASE_INPUT)
    await api.create({ ...BASE_INPUT, name: 'AccountId' })

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(2)
    expect(result.map((t) => t.name).sort()).toEqual(['AccountId', 'PhoneNumber'])
  })

  it('does not return custom types from a different system', async () => {
    await api.create(BASE_INPUT)
    await api.create({ ...BASE_INPUT, systemId: 'sys-2', name: 'OtherType' })

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('PhoneNumber')
  })

  it('ignores non-JSON files in the custom-types directory', async () => {
    await api.create(BASE_INPUT)

    const customTypesDir = path.join(tmpDir, 'systems', SYS_ID, 'custom-types')
    await fs.writeFile(path.join(customTypesDir, 'README.txt'), 'ignore me', 'utf-8')

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('CustomTypesApi — get', () => {
  it('returns the custom type by systemId and id', async () => {
    const created = await api.create(BASE_INPUT)

    const result = await api.get(SYS_ID, created.id)

    expect(result).toEqual(created)
  })

  it('throws when the custom type does not exist', async () => {
    await expect(api.get(SYS_ID, 'non-existent-id')).rejects.toThrow(
      'Custom type not found: non-existent-id'
    )
  })
})

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('CustomTypesApi — update', () => {
  it('updates the name and returns the updated custom type', async () => {
    const ct = await api.create(BASE_INPUT)

    const updated = await api.update(SYS_ID, ct.id, { name: 'TelephoneNumber' })

    expect(updated.name).toBe('TelephoneNumber')
    expect(updated.id).toBe(ct.id)
    expect(updated.systemId).toBe(SYS_ID)
  })

  it('updates the defaultStrategy', async () => {
    const ct = await api.create(BASE_INPUT)

    const updated = await api.update(SYS_ID, ct.id, {
      defaultStrategy: { type: 'faker', config: { method: 'phone.number' } }
    })

    expect(updated.defaultStrategy.type).toBe('faker')
    expect((updated.defaultStrategy.config as { method: string }).method).toBe('phone.number')
  })

  it('updates the baseType', async () => {
    const ct = await api.create({ ...BASE_INPUT, baseType: 'string' })

    const updated = await api.update(SYS_ID, ct.id, { baseType: 'integer' })

    expect(updated.baseType).toBe('integer')
  })

  it('updates constraints', async () => {
    const ct = await api.create(BASE_INPUT)

    const updated = await api.update(SYS_ID, ct.id, {
      constraints: { minLength: 10, maxLength: 10 }
    })

    expect(updated.constraints).toEqual({ minLength: 10, maxLength: 10 })
  })

  it('preserves fields not included in the update', async () => {
    const ct = await api.create({ ...BASE_INPUT, constraints: { minLength: 5 } })

    const updated = await api.update(SYS_ID, ct.id, { name: 'Renamed' })

    expect(updated.baseType).toBe(ct.baseType)
    expect(updated.defaultStrategy).toEqual(ct.defaultStrategy)
    expect(updated.constraints).toEqual(ct.constraints)
  })

  it('persists the update to disk', async () => {
    const ct = await api.create(BASE_INPUT)

    await api.update(SYS_ID, ct.id, { name: 'Persisted' })

    const filePath = StoragePaths.customType(tmpDir, SYS_ID, ct.id)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as CustomDataType
    expect(persisted.name).toBe('Persisted')
  })

  it('throws when the custom type does not exist', async () => {
    await expect(api.update(SYS_ID, 'missing-id', { name: 'X' })).rejects.toThrow(
      'Custom type not found: missing-id'
    )
  })
})

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('CustomTypesApi — delete', () => {
  it('removes the custom type file from disk', async () => {
    const ct = await api.create(BASE_INPUT)
    const filePath = StoragePaths.customType(tmpDir, SYS_ID, ct.id)

    await api.delete(SYS_ID, ct.id)

    await expect(fs.access(filePath)).rejects.toThrow()
  })

  it('custom type is no longer returned by list after deletion', async () => {
    const ct = await api.create(BASE_INPUT)

    await api.delete(SYS_ID, ct.id)

    const result = await api.list(SYS_ID)
    expect(result.find((t) => t.id === ct.id)).toBeUndefined()
  })

  it('does not throw when deleting a non-existent custom type', async () => {
    await expect(api.delete(SYS_ID, 'non-existent-id')).resolves.toBeDefined()
  })

  it('returns no warnings when no schemas reference the type', async () => {
    const ct = await api.create(BASE_INPUT)

    const result: DeleteCustomTypeResult = await api.delete(SYS_ID, ct.id)

    expect(result.warnings).toEqual([])
  })

  it('returns a warning when a schema references the deleted custom type', async () => {
    const ct = await api.create(BASE_INPUT)

    // Write a schema that references this custom type
    const schemaId = 'schema-ref-1'
    const schemasDir = path.join(tmpDir, 'systems', SYS_ID, 'schemas')
    await fs.mkdir(schemasDir, { recursive: true })
    const schema = {
      id: schemaId,
      systemId: SYS_ID,
      name: 'OrderSchema',
      elements: [
        {
          name: 'phone',
          required: true,
          dataType: { type: ct.id, customTypeId: ct.id },
          generationStrategy: { type: 'pattern', config: { pattern: '\\d{3}-\\d{3}-\\d{4}' } }
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await fs.writeFile(
      path.join(schemasDir, `${schemaId}.json`),
      JSON.stringify(schema, null, 2),
      'utf-8'
    )

    const result: DeleteCustomTypeResult = await api.delete(SYS_ID, ct.id)

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('OrderSchema')
  })

  it('returns a warning for each schema that references the deleted custom type', async () => {
    const ct = await api.create(BASE_INPUT)

    const schemasDir = path.join(tmpDir, 'systems', SYS_ID, 'schemas')
    await fs.mkdir(schemasDir, { recursive: true })

    for (const schemaName of ['SchemaA', 'SchemaB']) {
      const schemaId = `schema-${schemaName.toLowerCase()}`
      const schema = {
        id: schemaId,
        systemId: SYS_ID,
        name: schemaName,
        elements: [
          {
            name: 'field',
            required: false,
            dataType: { type: ct.id, customTypeId: ct.id },
            generationStrategy: { type: 'random', config: {} }
          }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      await fs.writeFile(
        path.join(schemasDir, `${schemaId}.json`),
        JSON.stringify(schema, null, 2),
        'utf-8'
      )
    }

    const result: DeleteCustomTypeResult = await api.delete(SYS_ID, ct.id)

    expect(result.warnings).toHaveLength(2)
    const names = result.warnings.map((w) => w)
    expect(names.some((w) => w.includes('SchemaA'))).toBe(true)
    expect(names.some((w) => w.includes('SchemaB'))).toBe(true)
  })

  it('detects references in nested schema elements', async () => {
    const ct = await api.create(BASE_INPUT)

    const schemasDir = path.join(tmpDir, 'systems', SYS_ID, 'schemas')
    await fs.mkdir(schemasDir, { recursive: true })
    const schema = {
      id: 'schema-nested',
      systemId: SYS_ID,
      name: 'NestedSchema',
      elements: [
        {
          name: 'address',
          required: false,
          dataType: { type: 'object' },
          generationStrategy: { type: 'random', config: {} },
          children: [
            {
              name: 'phone',
              required: true,
              dataType: { type: ct.id, customTypeId: ct.id },
              generationStrategy: { type: 'pattern', config: { pattern: '\\d+' } }
            }
          ]
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await fs.writeFile(
      path.join(schemasDir, 'schema-nested.json'),
      JSON.stringify(schema, null, 2),
      'utf-8'
    )

    const result: DeleteCustomTypeResult = await api.delete(SYS_ID, ct.id)

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('NestedSchema')
  })

  it('still deletes the file even when warnings are present', async () => {
    const ct = await api.create(BASE_INPUT)
    const filePath = StoragePaths.customType(tmpDir, SYS_ID, ct.id)

    // Write a schema that references this custom type
    const schemasDir = path.join(tmpDir, 'systems', SYS_ID, 'schemas')
    await fs.mkdir(schemasDir, { recursive: true })
    const schema = {
      id: 'schema-ref',
      systemId: SYS_ID,
      name: 'ReferencingSchema',
      elements: [
        {
          name: 'field',
          required: false,
          dataType: { type: ct.id, customTypeId: ct.id },
          generationStrategy: { type: 'random', config: {} }
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await fs.writeFile(
      path.join(schemasDir, 'schema-ref.json'),
      JSON.stringify(schema, null, 2),
      'utf-8'
    )

    const result = await api.delete(SYS_ID, ct.id)

    expect(result.warnings).toHaveLength(1)
    await expect(fs.access(filePath)).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// full round-trip
// ---------------------------------------------------------------------------

describe('CustomTypesApi — full round-trip', () => {
  it('create → list → get → update → delete', async () => {
    // Create
    const created = await api.create(BASE_INPUT)
    expect(created.id).toBeTruthy()

    // List
    const listed = await api.list(SYS_ID)
    expect(listed).toHaveLength(1)
    expect(listed[0].id).toBe(created.id)

    // Get
    const fetched = await api.get(SYS_ID, created.id)
    expect(fetched).toEqual(created)

    // Update
    const updated = await api.update(SYS_ID, created.id, { name: 'UpdatedPhone' })
    expect(updated.name).toBe('UpdatedPhone')
    expect(updated.id).toBe(created.id)

    // Delete
    const deleteResult = await api.delete(SYS_ID, created.id)
    expect(deleteResult.warnings).toEqual([])

    // Verify gone
    const finalList = await api.list(SYS_ID)
    expect(finalList).toHaveLength(0)
  })
})
