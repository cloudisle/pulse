import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { StorageService } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import { SchemasApi } from '@main/api/schemas'
import type { Schema, SchemaElement } from '@shared/models/schema'
import type { CreateSchemaInput, UpdateSchemaInput } from '@shared/dto/schemas'

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let api: SchemasApi

const systemId = 'sys-test-1'

const flatElement: SchemaElement = {
  name: 'userId',
  required: true,
  dataType: { type: 'string' },
  generationStrategy: { type: 'faker', config: { method: 'string.uuid' } }
}

const nestedObjectElement: SchemaElement = {
  name: 'address',
  required: false,
  dataType: { type: 'object' },
  generationStrategy: { type: 'random', config: {} },
  children: [
    {
      name: 'street',
      required: true,
      dataType: { type: 'string' },
      generationStrategy: { type: 'faker', config: { method: 'location.street' } }
    },
    {
      name: 'zip',
      required: true,
      dataType: { type: 'string' },
      generationStrategy: { type: 'pattern', config: { pattern: '\\d{5}' } }
    }
  ]
}

const nestedArrayElement: SchemaElement = {
  name: 'tags',
  required: false,
  dataType: { type: 'array' },
  generationStrategy: { type: 'random', config: {} },
  children: [
    {
      name: 'tag',
      required: true,
      dataType: { type: 'string' },
      generationStrategy: { type: 'faker', config: { method: 'lorem.word' } }
    }
  ]
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-schemas-test-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)
  api = new SchemasApi(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('SchemasApi — create (flat schema)', () => {
  it('creates a schema and returns it with id and timestamps', async () => {
    const input: CreateSchemaInput = {
      systemId,
      name: 'UserEvent',
      elements: [flatElement]
    }

    const schema = await api.create(input)

    expect(schema.id).toBeDefined()
    expect(schema.systemId).toBe(systemId)
    expect(schema.name).toBe('UserEvent')
    expect(schema.elements).toHaveLength(1)
    expect(schema.createdAt).toBeDefined()
    expect(schema.updatedAt).toBeDefined()
  })

  it('persists the schema to disk', async () => {
    const input: CreateSchemaInput = {
      systemId,
      name: 'UserEvent',
      elements: [flatElement]
    }

    const schema = await api.create(input)
    const filePath = path.join(tmpDir, 'systems', systemId, 'schemas', `${schema.id}.json`)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as Schema

    expect(persisted.id).toBe(schema.id)
    expect(persisted.name).toBe('UserEvent')
  })

  it('includes optional description when provided', async () => {
    const input: CreateSchemaInput = {
      systemId,
      name: 'OrderEvent',
      description: 'Describes order events',
      elements: [flatElement]
    }

    const schema = await api.create(input)

    expect(schema.description).toBe('Describes order events')
  })
})

describe('SchemasApi — create (nested schema)', () => {
  it('creates a schema with nested object children', async () => {
    const input: CreateSchemaInput = {
      systemId,
      name: 'OrderPlaced',
      elements: [flatElement, nestedObjectElement]
    }

    const schema = await api.create(input)

    expect(schema.elements).toHaveLength(2)
    const address = schema.elements.find((e) => e.name === 'address')
    expect(address).toBeDefined()
    expect(address!.children).toHaveLength(2)
    expect(address!.children![0].name).toBe('street')
    expect(address!.children![1].name).toBe('zip')
  })

  it('creates a schema with nested array children', async () => {
    const input: CreateSchemaInput = {
      systemId,
      name: 'TaggedEvent',
      elements: [flatElement, nestedArrayElement]
    }

    const schema = await api.create(input)

    const tags = schema.elements.find((e) => e.name === 'tags')
    expect(tags).toBeDefined()
    expect(tags!.children).toHaveLength(1)
    expect(tags!.children![0].name).toBe('tag')
  })
})

describe('SchemasApi — get', () => {
  it('retrieves a schema by id', async () => {
    const created = await api.create({ systemId, name: 'TestSchema', elements: [flatElement] })
    const found = await api.get(systemId, created.id)

    expect(found.id).toBe(created.id)
    expect(found.name).toBe('TestSchema')
  })

  it('throws when schema does not exist', async () => {
    await expect(api.get(systemId, 'nonexistent-id')).rejects.toThrow('Schema not found')
  })
})

describe('SchemasApi — list', () => {
  it('returns an empty array when no schemas exist', async () => {
    const schemas = await api.list(systemId)

    expect(schemas).toEqual([])
  })

  it('returns all schemas for a system', async () => {
    await api.create({ systemId, name: 'SchemaA', elements: [flatElement] })
    await api.create({ systemId, name: 'SchemaB', elements: [flatElement] })

    const schemas = await api.list(systemId)

    expect(schemas).toHaveLength(2)
    const names = schemas.map((s) => s.name).sort()
    expect(names).toEqual(['SchemaA', 'SchemaB'])
  })

  it('only returns schemas for the specified system', async () => {
    await api.create({ systemId, name: 'SchemaA', elements: [flatElement] })
    await api.create({ systemId: 'other-system', name: 'SchemaB', elements: [flatElement] })

    const schemas = await api.list(systemId)

    expect(schemas).toHaveLength(1)
    expect(schemas[0].name).toBe('SchemaA')
  })
})

describe('SchemasApi — update', () => {
  it('updates schema name', async () => {
    const created = await api.create({ systemId, name: 'OldName', elements: [flatElement] })
    const data: UpdateSchemaInput = { name: 'NewName' }

    const updated = await api.update(systemId, created.id, data)

    expect(updated.name).toBe('NewName')
    expect(updated.id).toBe(created.id)
  })

  it('updates schema elements', async () => {
    const created = await api.create({ systemId, name: 'MySchema', elements: [flatElement] })
    const newElement: SchemaElement = {
      name: 'email',
      required: true,
      dataType: { type: 'string' },
      generationStrategy: { type: 'faker', config: { method: 'internet.email' } }
    }
    const data: UpdateSchemaInput = { elements: [flatElement, newElement] }

    const updated = await api.update(systemId, created.id, data)

    expect(updated.elements).toHaveLength(2)
    expect(updated.elements.find((e) => e.name === 'email')).toBeDefined()
  })

  it('updates the updatedAt timestamp', async () => {
    const created = await api.create({ systemId, name: 'MySchema', elements: [flatElement] })
    // Ensure some time passes to get a different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10))

    const updated = await api.update(systemId, created.id, { name: 'Updated' })

    expect(updated.updatedAt >= created.updatedAt).toBe(true)
  })

  it('persists the updated schema to disk', async () => {
    const created = await api.create({ systemId, name: 'MySchema', elements: [flatElement] })

    await api.update(systemId, created.id, { name: 'PersistedName' })

    const fromDisk = await api.get(systemId, created.id)
    expect(fromDisk.name).toBe('PersistedName')
  })
})

describe('SchemasApi — delete', () => {
  it('deletes an existing schema', async () => {
    const created = await api.create({ systemId, name: 'ToDelete', elements: [flatElement] })

    await api.delete(systemId, created.id)

    await expect(api.get(systemId, created.id)).rejects.toThrow('Schema not found')
  })

  it('does not throw when deleting a non-existent schema', async () => {
    await expect(api.delete(systemId, 'nonexistent-id')).resolves.toBeUndefined()
  })
})

describe('SchemasApi — validate', () => {
  it('returns valid with no warnings for a well-formed schema', async () => {
    const created = await api.create({ systemId, name: 'ValidSchema', elements: [flatElement] })

    const result = await api.validate(systemId, created.id)

    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('warns when a required field has no generation strategy', async () => {
    const elementWithoutStrategy = {
      name: 'missingStrategy',
      required: true,
      dataType: { type: 'string' },
      generationStrategy: null as any
    } as SchemaElement

    const created = await api.create({
      systemId,
      name: 'BadSchema',
      elements: [elementWithoutStrategy]
    })

    const result = await api.validate(systemId, created.id)

    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.elementPath === 'missingStrategy')).toBe(true)
    expect(result.warnings.some((w) => w.message.includes('generation strategy'))).toBe(true)
  })

  it('warns when a constraint pattern is an invalid regex', async () => {
    const elementWithBadPattern: SchemaElement = {
      name: 'badPattern',
      required: false,
      dataType: { type: 'string' },
      generationStrategy: { type: 'random', config: {} },
      constraints: { pattern: '[invalid(regex' }
    }

    const created = await api.create({
      systemId,
      name: 'InvalidRegexSchema',
      elements: [elementWithBadPattern]
    })

    const result = await api.validate(systemId, created.id)

    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.elementPath === 'badPattern')).toBe(true)
    expect(result.warnings.some((w) => w.message.includes('valid regular expression'))).toBe(true)
  })

  it('warns when a custom type reference does not exist', async () => {
    const elementWithMissingType: SchemaElement = {
      name: 'customField',
      required: false,
      dataType: { type: 'custom-type-id', customTypeId: 'nonexistent-custom-type' },
      generationStrategy: { type: 'random', config: {} }
    }

    const created = await api.create({
      systemId,
      name: 'MissingTypeSchema',
      elements: [elementWithMissingType]
    })

    const result = await api.validate(systemId, created.id)

    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.elementPath === 'customField')).toBe(true)
    expect(result.warnings.some((w) => w.message.includes('nonexistent-custom-type'))).toBe(true)
  })

  it('warns when enum values do not match the element type', async () => {
    const elementWithMismatchedEnum: SchemaElement = {
      name: 'numericField',
      required: false,
      dataType: { type: 'integer' },
      generationStrategy: { type: 'enum', config: { values: [1, 2, 3] } },
      constraints: { enum: [1, 2, 'not-an-integer'] }
    }

    const created = await api.create({
      systemId,
      name: 'MismatchedEnumSchema',
      elements: [elementWithMismatchedEnum]
    })

    const result = await api.validate(systemId, created.id)

    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.elementPath === 'numericField')).toBe(true)
    expect(result.warnings.some((w) => w.message.includes('not-an-integer'))).toBe(true)
  })

  it('validates nested elements and reports correct element paths', async () => {
    const elementWithBadPattern: SchemaElement = {
      name: 'street',
      required: false,
      dataType: { type: 'string' },
      generationStrategy: { type: 'random', config: {} },
      constraints: { pattern: '[bad(' }
    }
    const input: CreateSchemaInput = {
      systemId,
      name: 'NestedValidationSchema',
      elements: [
        {
          name: 'address',
          required: false,
          dataType: { type: 'object' },
          generationStrategy: { type: 'random', config: {} },
          children: [elementWithBadPattern]
        }
      ]
    }

    const created = await api.create(input)
    const result = await api.validate(systemId, created.id)

    expect(result.valid).toBe(true)
    expect(result.warnings.some((w) => w.elementPath === 'address.street')).toBe(true)
  })

  it('does not warn when a valid regex pattern is used', async () => {
    const elementWithGoodPattern: SchemaElement = {
      name: 'zipCode',
      required: false,
      dataType: { type: 'string' },
      generationStrategy: { type: 'pattern', config: { pattern: '\\d{5}' } },
      constraints: { pattern: '\\d{5}' }
    }

    const created = await api.create({
      systemId,
      name: 'ValidRegexSchema',
      elements: [elementWithGoodPattern]
    })

    const result = await api.validate(systemId, created.id)

    expect(result.warnings).toHaveLength(0)
  })
})
