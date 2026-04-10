import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import { SystemsApi } from '@main/api/systems'
import type { System } from '@shared/models'
import type { Schema, CustomDataType } from '@shared/models/schema'
import type { Environment } from '@shared/models/environment'
import type { Profile } from '@shared/models/profile'
import type { Template, TemplateFolder } from '@shared/models/template'
import type { CreateSystemInput, ExportedSystem } from '@shared/dto'

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let api: SystemsApi

const kinesisInput: Omit<import('@shared/models').InputConfig, 'id'> = {
  name: 'My Input',
  type: 'kinesis',
  config: { streamName: 'my-stream', region: 'us-east-1' }
}

const sqsOutput: Omit<import('@shared/models').OutputConfig, 'id'> = {
  name: 'My Output',
  type: 'sqs',
  config: { queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/q', region: 'us-east-1' },
  contentType: 'json'
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-systems-test-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)
  api = new SystemsApi(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('SystemsApi — list', () => {
  it('returns an empty array when no systems directory exists', async () => {
    const result = await api.list()
    expect(result).toEqual([])
  })

  it('returns an empty array when systems directory is empty', async () => {
    await fs.mkdir(path.join(tmpDir, 'systems'), { recursive: true })
    const result = await api.list()
    expect(result).toEqual([])
  })

  it('returns all persisted systems', async () => {
    const a = await api.create({ name: 'System A', inputs: [], outputs: [] })
    const b = await api.create({ name: 'System B', inputs: [], outputs: [] })

    const result = await api.list()

    expect(result).toHaveLength(2)
    const ids = result.map((s) => s.id)
    expect(ids).toContain(a.id)
    expect(ids).toContain(b.id)
  })

  it('skips directories that have no system.json', async () => {
    await api.create({ name: 'Valid System', inputs: [], outputs: [] })

    // Create an orphaned directory without a system.json
    await fs.mkdir(path.join(tmpDir, 'systems', 'orphan'), { recursive: true })

    const result = await api.list()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Valid System')
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('SystemsApi — get', () => {
  it('returns the system for a valid id', async () => {
    const created = await api.create({ name: 'Test', inputs: [], outputs: [] })
    const result = await api.get(created.id)
    expect(result).toEqual(created)
  })

  it('throws when the system does not exist', async () => {
    await expect(api.get('non-existent-id')).rejects.toThrow('System not found: non-existent-id')
  })
})

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('SystemsApi — create', () => {
  it('returns a System with a generated UUID', async () => {
    const result = await api.create({ name: 'New System', inputs: [], outputs: [] })

    expect(result.id).toBeDefined()
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(result.name).toBe('New System')
  })

  it('sets createdAt and updatedAt to the same ISO timestamp', async () => {
    const result = await api.create({ name: 'Ts Test', inputs: [], outputs: [] })

    expect(result.createdAt).toBe(result.updatedAt)
    expect(() => new Date(result.createdAt)).not.toThrow()
  })

  it('persists system.json to disk', async () => {
    const result = await api.create({ name: 'Persisted', inputs: [], outputs: [] })

    const raw = await fs.readFile(StoragePaths.system(tmpDir, result.id), 'utf-8')
    const persisted = JSON.parse(raw) as System
    expect(persisted).toEqual(result)
  })

  it('creates the full directory structure', async () => {
    const result = await api.create({ name: 'Dir Test', inputs: [], outputs: [] })
    const systemDir = path.join(tmpDir, 'systems', result.id)

    for (const subDir of [
      'schemas',
      'environments',
      'profiles',
      'custom-types',
      'templates',
      'sessions'
    ]) {
      const stat = await fs.stat(path.join(systemDir, subDir))
      expect(stat.isDirectory()).toBe(true)
    }
  })

  it('stores description when provided', async () => {
    const result = await api.create({
      name: 'With Desc',
      description: 'A description',
      inputs: [],
      outputs: []
    })
    expect(result.description).toBe('A description')
  })

  it('omits description from result when not provided', async () => {
    const result = await api.create({ name: 'No Desc', inputs: [], outputs: [] })
    expect(result.description).toBeUndefined()
  })

  it('generates UUIDs for provided inputs', async () => {
    const result = await api.create({ name: 'With Inputs', inputs: [kinesisInput], outputs: [] })

    expect(result.inputs).toHaveLength(1)
    expect(result.inputs[0].id).toBeDefined()
    expect(result.inputs[0].name).toBe(kinesisInput.name)
    expect(result.inputs[0].type).toBe(kinesisInput.type)
  })

  it('generates UUIDs for provided outputs', async () => {
    const result = await api.create({ name: 'With Outputs', inputs: [], outputs: [sqsOutput] })

    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0].id).toBeDefined()
    expect(result.outputs[0].name).toBe(sqsOutput.name)
    expect(result.outputs[0].type).toBe(sqsOutput.type)
  })

  it('generates distinct UUIDs for each input/output', async () => {
    const result = await api.create({
      name: 'Multi IO',
      inputs: [kinesisInput, kinesisInput],
      outputs: [sqsOutput, sqsOutput]
    })

    const inputIds = result.inputs.map((i) => i.id)
    expect(new Set(inputIds).size).toBe(2)

    const outputIds = result.outputs.map((o) => o.id)
    expect(new Set(outputIds).size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('SystemsApi — update', () => {
  let created: System

  beforeEach(async () => {
    created = await api.create({
      name: 'Original',
      description: 'Original desc',
      inputs: [kinesisInput],
      outputs: [sqsOutput]
    })
  })

  it('updates the name and persists the change', async () => {
    const result = await api.update(created.id, { name: 'Renamed' })

    expect(result.name).toBe('Renamed')

    const raw = await fs.readFile(StoragePaths.system(tmpDir, created.id), 'utf-8')
    expect(JSON.parse(raw).name).toBe('Renamed')
  })

  it('updates the description', async () => {
    const result = await api.update(created.id, { description: 'New desc' })
    expect(result.description).toBe('New desc')
  })

  it('replaces inputs when provided', async () => {
    const newInput = { ...created.inputs[0], name: 'Updated Input' }
    const result = await api.update(created.id, { inputs: [newInput] })

    expect(result.inputs).toHaveLength(1)
    expect(result.inputs[0].name).toBe('Updated Input')
  })

  it('replaces outputs when provided', async () => {
    const newOutput = { ...created.outputs[0], name: 'Updated Output' }
    const result = await api.update(created.id, { outputs: [newOutput] })

    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0].name).toBe('Updated Output')
  })

  it('preserves unchanged fields', async () => {
    const result = await api.update(created.id, { name: 'Only Name Changed' })

    expect(result.description).toBe('Original desc')
    expect(result.inputs).toHaveLength(1)
    expect(result.outputs).toHaveLength(1)
    expect(result.createdAt).toBe(created.createdAt)
  })

  it('updates updatedAt but not createdAt', async () => {
    await new Promise((r) => setTimeout(r, 5))
    const result = await api.update(created.id, { name: 'Updated' })

    expect(result.createdAt).toBe(created.createdAt)
    expect(result.updatedAt).not.toBe(created.updatedAt)
  })

  it('throws when the system does not exist', async () => {
    await expect(api.update('no-such-id', { name: 'X' })).rejects.toThrow(
      'System not found: no-such-id'
    )
  })
})

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('SystemsApi — delete', () => {
  it('removes the system directory', async () => {
    const system = await api.create({ name: 'To Delete', inputs: [], outputs: [] })
    const systemDir = path.join(tmpDir, 'systems', system.id)

    await api.delete(system.id)

    await expect(fs.access(systemDir)).rejects.toThrow()
  })

  it('makes the system no longer retrievable after deletion', async () => {
    const system = await api.create({ name: 'Gone', inputs: [], outputs: [] })

    await api.delete(system.id)

    await expect(api.get(system.id)).rejects.toThrow(`System not found: ${system.id}`)
  })

  it('throws when the system does not exist', async () => {
    await expect(api.delete('ghost-id')).rejects.toThrow('System not found: ghost-id')
  })
})

// ---------------------------------------------------------------------------
// full round-trip
// ---------------------------------------------------------------------------

describe('SystemsApi — full round-trip', () => {
  it('create → list → get → update → delete', async () => {
    // create
    const created: CreateSystemInput = {
      name: 'Round-trip System',
      description: 'Testing full cycle',
      inputs: [kinesisInput],
      outputs: [sqsOutput]
    }
    const system = await api.create(created)
    expect(system.name).toBe('Round-trip System')

    // list
    const listed = await api.list()
    expect(listed.find((s) => s.id === system.id)).toBeDefined()

    // get
    const fetched = await api.get(system.id)
    expect(fetched).toEqual(system)

    // update
    const updated = await api.update(system.id, { name: 'Renamed System' })
    expect(updated.name).toBe('Renamed System')

    // verify update persisted
    const afterUpdate = await api.get(system.id)
    expect(afterUpdate.name).toBe('Renamed System')

    // delete
    await api.delete(system.id)

    // verify deleted
    await expect(api.get(system.id)).rejects.toThrow()

    const listedAfterDelete = await api.list()
    expect(listedAfterDelete.find((s) => s.id === system.id)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Helpers: write test data to disk for export/import tests
// ---------------------------------------------------------------------------

async function writeSchema(
  storage: StorageService,
  dataDir: string,
  systemId: string,
  schema: Schema
): Promise<void> {
  await storage.write(StoragePaths.schema(dataDir, systemId, schema.id), schema)
}

async function writeEnvironment(
  storage: StorageService,
  dataDir: string,
  systemId: string,
  env: Environment
): Promise<void> {
  await storage.write(StoragePaths.environment(dataDir, systemId, env.id), env)
}

async function writeProfile(
  storage: StorageService,
  dataDir: string,
  systemId: string,
  profile: Profile
): Promise<void> {
  await storage.write(StoragePaths.profile(dataDir, systemId, profile.id), profile)
}

async function writeTemplate(
  storage: StorageService,
  dataDir: string,
  systemId: string,
  template: Template
): Promise<void> {
  await storage.write(StoragePaths.template(dataDir, systemId, template.id), template)
}

async function writeCustomType(
  storage: StorageService,
  dataDir: string,
  systemId: string,
  ct: CustomDataType
): Promise<void> {
  await storage.write(StoragePaths.customType(dataDir, systemId, ct.id), ct)
}

async function writeTemplateFolders(
  storage: StorageService,
  dataDir: string,
  systemId: string,
  folders: TemplateFolder[]
): Promise<void> {
  await storage.write(StoragePaths.templateFolders(dataDir, systemId), folders)
}

// ---------------------------------------------------------------------------
// export
// ---------------------------------------------------------------------------

describe('SystemsApi — export', () => {
  it('throws when system does not exist', async () => {
    await expect(api.export('non-existent-id')).rejects.toThrow('System not found: non-existent-id')
  })

  it('returns an ExportedSystem with empty collections when no data exists', async () => {
    const system = await api.create({ name: 'Empty System', inputs: [], outputs: [] })
    const exported = await api.export(system.id)

    expect(exported.system).toEqual(system)
    expect(exported.schemas).toEqual([])
    expect(exported.environments).toEqual([])
    expect(exported.profiles).toEqual([])
    expect(exported.templates).toEqual([])
    expect(exported.templateFolders).toEqual([])
    expect(exported.customTypes).toEqual([])
  })

  it('masks sensitive environment variable values', async () => {
    const system = await api.create({ name: 'Env System', inputs: [], outputs: [] })

    const env: Environment = {
      id: 'env-1',
      systemId: system.id,
      name: 'Prod',
      variables: [
        { key: 'REGION', value: 'us-east-1', sensitive: false },
        { key: 'SECRET_KEY', value: 'super-secret-value', sensitive: true },
        { key: 'API_TOKEN', value: 'my-token', sensitive: true }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeEnvironment(storage, tmpDir, system.id, env)

    const exported = await api.export(system.id)

    expect(exported.environments).toHaveLength(1)
    const exportedEnv = exported.environments[0]
    expect(exportedEnv.variables[0]).toEqual({ key: 'REGION', value: 'us-east-1', sensitive: false })
    expect(exportedEnv.variables[1]).toEqual({ key: 'SECRET_KEY', value: '', sensitive: true })
    expect(exportedEnv.variables[2]).toEqual({ key: 'API_TOKEN', value: '', sensitive: true })
  })

  it('does not mask non-sensitive environment variable values', async () => {
    const system = await api.create({ name: 'Env System', inputs: [], outputs: [] })

    const env: Environment = {
      id: 'env-2',
      systemId: system.id,
      name: 'Dev',
      variables: [{ key: 'STAGE', value: 'development', sensitive: false }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeEnvironment(storage, tmpDir, system.id, env)

    const exported = await api.export(system.id)

    expect(exported.environments[0].variables[0].value).toBe('development')
  })

  it('exports schemas, profiles, templates, folders and custom types', async () => {
    const system = await api.create({
      name: 'Full System',
      inputs: [kinesisInput],
      outputs: [sqsOutput]
    })
    const inputId = system.inputs[0].id

    const customType: CustomDataType = {
      id: 'ctype-1',
      systemId: system.id,
      name: 'AccountId',
      baseType: 'string',
      defaultStrategy: { type: 'pattern', config: { pattern: 'ACCT-[A-Z]{8}' } }
    }
    await writeCustomType(storage, tmpDir, system.id, customType)

    const schema: Schema = {
      id: 'schema-1',
      systemId: system.id,
      name: 'OrderPlaced',
      elements: [
        {
          name: 'accountId',
          required: true,
          dataType: { type: 'ctype-1', customTypeId: 'ctype-1' },
          generationStrategy: { type: 'pattern', config: { pattern: 'ACCT-[A-Z]{8}' } }
        }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeSchema(storage, tmpDir, system.id, schema)

    const profile: Profile = {
      id: 'profile-1',
      systemId: system.id,
      name: 'High Value',
      overrides: [{ elementPath: 'amount', action: 'set', value: 9000 }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeProfile(storage, tmpDir, system.id, profile)

    const folder: TemplateFolder = { id: 'folder-1', systemId: system.id, parentId: null, name: 'Orders' }
    await writeTemplateFolders(storage, tmpDir, system.id, [folder])

    const template: Template = {
      id: 'tmpl-1',
      systemId: system.id,
      folderId: 'folder-1',
      name: 'Standard Order',
      schemaId: 'schema-1',
      inputId,
      profileIds: ['profile-1'],
      fields: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeTemplate(storage, tmpDir, system.id, template)

    const exported = await api.export(system.id)

    expect(exported.schemas).toHaveLength(1)
    expect(exported.schemas[0].id).toBe('schema-1')
    expect(exported.profiles).toHaveLength(1)
    expect(exported.profiles[0].id).toBe('profile-1')
    expect(exported.templateFolders).toHaveLength(1)
    expect(exported.templateFolders[0].id).toBe('folder-1')
    expect(exported.templates).toHaveLength(1)
    expect(exported.templates[0].id).toBe('tmpl-1')
    expect(exported.customTypes).toHaveLength(1)
    expect(exported.customTypes[0].id).toBe('ctype-1')
  })
})

// ---------------------------------------------------------------------------
// import
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('SystemsApi — import', () => {
  it('creates a new system with a new UUID', async () => {
    const bundle: ExportedSystem = {
      system: {
        id: 'old-sys-id',
        name: 'Imported System',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: []
    }

    const result = await api.import(bundle)

    expect(result.id).toMatch(UUID_RE)
    expect(result.id).not.toBe('old-sys-id')
    expect(result.name).toBe('Imported System')
  })

  it('generates new UUIDs for system inputs and outputs', async () => {
    const oldInputId = 'old-input-id'
    const oldOutputId = 'old-output-id'

    const bundle: ExportedSystem = {
      system: {
        id: 'old-sys-id',
        name: 'IO System',
        inputs: [
          { id: oldInputId, name: 'In', type: 'kinesis', config: { streamName: 's', region: 'us-east-1' } }
        ],
        outputs: [
          { id: oldOutputId, name: 'Out', type: 'sqs', config: { queueUrl: 'https://q', region: 'us-east-1' }, contentType: 'json' }
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: []
    }

    const result = await api.import(bundle)

    expect(result.inputs).toHaveLength(1)
    expect(result.inputs[0].id).toMatch(UUID_RE)
    expect(result.inputs[0].id).not.toBe(oldInputId)

    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0].id).toMatch(UUID_RE)
    expect(result.outputs[0].id).not.toBe(oldOutputId)
  })

  it('persists the imported system to disk and makes it retrievable', async () => {
    const bundle: ExportedSystem = {
      system: {
        id: 'old-sys-id',
        name: 'Persisted Import',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: []
    }

    const result = await api.import(bundle)

    const fetched = await api.get(result.id)
    expect(fetched).toEqual(result)

    const allSystems = await api.list()
    expect(allSystems.find((s) => s.id === result.id)).toBeDefined()
  })

  it('remaps schema FK references on import', async () => {
    const oldSchemaId = 'old-schema-id'
    const oldCustomTypeId = 'old-ctype-id'

    const bundle: ExportedSystem = {
      system: {
        id: 'old-sys-id',
        name: 'Schema FK System',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [
        {
          id: oldSchemaId,
          systemId: 'old-sys-id',
          name: 'Order',
          elements: [
            {
              name: 'accountId',
              required: true,
              dataType: { type: oldCustomTypeId, customTypeId: oldCustomTypeId },
              generationStrategy: { type: 'pattern', config: { pattern: 'X' } }
            }
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: [
        {
          id: oldCustomTypeId,
          systemId: 'old-sys-id',
          name: 'AccountId',
          baseType: 'string',
          defaultStrategy: { type: 'pattern', config: { pattern: 'X' } }
        }
      ]
    }

    const result = await api.import(bundle)

    // Verify custom type was persisted with new IDs
    const customTypesDir = path.join(tmpDir, 'systems', result.id, 'custom-types')
    const ctFiles = await fs.readdir(customTypesDir)
    expect(ctFiles).toHaveLength(1)
    const newCtId = ctFiles[0].slice(0, -5)
    expect(newCtId).toMatch(UUID_RE)
    expect(newCtId).not.toBe(oldCustomTypeId)

    // Verify schema was persisted with remapped systemId and customTypeId
    const schemasDir = path.join(tmpDir, 'systems', result.id, 'schemas')
    const schemaFiles = await fs.readdir(schemasDir)
    expect(schemaFiles).toHaveLength(1)
    const newSchemaId = schemaFiles[0].slice(0, -5)
    expect(newSchemaId).toMatch(UUID_RE)
    expect(newSchemaId).not.toBe(oldSchemaId)

    const savedSchema = await storage.read<Schema>(
      StoragePaths.schema(tmpDir, result.id, newSchemaId)
    )
    expect(savedSchema!.systemId).toBe(result.id)
    expect(savedSchema!.elements[0].dataType.customTypeId).toBe(newCtId)
    expect(savedSchema!.elements[0].dataType.type).toBe(newCtId)
  })

  it('remaps template FK references (schemaId, inputId, profileIds, folderId) on import', async () => {
    const oldInputId = 'old-input-id'
    const oldSchemaId = 'old-schema-id'
    const oldProfileId = 'old-profile-id'
    const oldFolderId = 'old-folder-id'

    const bundle: ExportedSystem = {
      system: {
        id: 'old-sys-id',
        name: 'Template FK System',
        inputs: [
          { id: oldInputId, name: 'In', type: 'kinesis', config: { streamName: 's', region: 'us-east-1' } }
        ],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [
        {
          id: oldSchemaId,
          systemId: 'old-sys-id',
          name: 'Order',
          elements: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      environments: [],
      profiles: [
        {
          id: oldProfileId,
          systemId: 'old-sys-id',
          name: 'High Value',
          overrides: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      templates: [
        {
          id: 'old-tmpl-id',
          systemId: 'old-sys-id',
          folderId: oldFolderId,
          name: 'Standard Order',
          schemaId: oldSchemaId,
          inputId: oldInputId,
          profileIds: [oldProfileId],
          fields: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      templateFolders: [{ id: oldFolderId, systemId: 'old-sys-id', parentId: null, name: 'Orders' }],
      customTypes: []
    }

    const result = await api.import(bundle)

    const newInputId = result.inputs[0].id

    // Verify template was persisted with remapped FK references
    const templatesDir = path.join(tmpDir, 'systems', result.id, 'templates')
    const templateFiles = (await fs.readdir(templatesDir)).filter(
      (f) => f.endsWith('.json') && f !== 'folders.json'
    )
    expect(templateFiles).toHaveLength(1)

    const newTmplId = templateFiles[0].slice(0, -5)
    const savedTemplate = await storage.read<Template>(
      StoragePaths.template(tmpDir, result.id, newTmplId)
    )

    expect(savedTemplate!.systemId).toBe(result.id)
    expect(savedTemplate!.inputId).toBe(newInputId)
    expect(savedTemplate!.schemaId).toMatch(UUID_RE)
    expect(savedTemplate!.schemaId).not.toBe(oldSchemaId)
    expect(savedTemplate!.profileIds).toHaveLength(1)
    expect(savedTemplate!.profileIds[0]).toMatch(UUID_RE)
    expect(savedTemplate!.profileIds[0]).not.toBe(oldProfileId)
    expect(savedTemplate!.folderId).toMatch(UUID_RE)
    expect(savedTemplate!.folderId).not.toBe(oldFolderId)
  })

  it('remaps template folder parentId FK references on import', async () => {
    const oldParentId = 'old-parent-folder-id'
    const oldChildId = 'old-child-folder-id'

    const bundle: ExportedSystem = {
      system: {
        id: 'old-sys-id',
        name: 'Folder FK System',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [
        { id: oldParentId, systemId: 'old-sys-id', parentId: null, name: 'Root' },
        { id: oldChildId, systemId: 'old-sys-id', parentId: oldParentId, name: 'Child' }
      ],
      customTypes: []
    }

    const result = await api.import(bundle)

    const savedFolders = await storage.read<TemplateFolder[]>(
      StoragePaths.templateFolders(tmpDir, result.id)
    )
    expect(savedFolders).toHaveLength(2)

    const root = savedFolders!.find((f) => f.name === 'Root')!
    const child = savedFolders!.find((f) => f.name === 'Child')!

    expect(root.id).toMatch(UUID_RE)
    expect(root.id).not.toBe(oldParentId)
    expect(root.parentId).toBeNull()

    expect(child.id).toMatch(UUID_RE)
    expect(child.id).not.toBe(oldChildId)
    expect(child.parentId).toBe(root.id) // remapped to new parent ID
  })

  it('preserves environments with empty sensitive values', async () => {
    const bundle: ExportedSystem = {
      system: {
        id: 'old-sys-id',
        name: 'Sensitive Env System',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [],
      environments: [
        {
          id: 'old-env-id',
          systemId: 'old-sys-id',
          name: 'Prod',
          variables: [
            { key: 'REGION', value: 'us-east-1', sensitive: false },
            { key: 'SECRET', value: '', sensitive: true }
          ],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: []
    }

    const result = await api.import(bundle)

    const envsDir = path.join(tmpDir, 'systems', result.id, 'environments')
    const envFiles = await fs.readdir(envsDir)
    expect(envFiles).toHaveLength(1)

    const savedEnv = await storage.read<Environment>(path.join(envsDir, envFiles[0]))
    expect(savedEnv!.variables[0]).toEqual({ key: 'REGION', value: 'us-east-1', sensitive: false })
    expect(savedEnv!.variables[1]).toEqual({ key: 'SECRET', value: '', sensitive: true })
  })

  it('does not collide with existing system IDs', async () => {
    const existing = await api.create({ name: 'Existing', inputs: [], outputs: [] })

    const bundle: ExportedSystem = {
      system: {
        id: existing.id, // same old ID — import must generate a new one
        name: 'Imported Clone',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: []
    }

    const result = await api.import(bundle)

    expect(result.id).not.toBe(existing.id)

    const allSystems = await api.list()
    expect(allSystems).toHaveLength(2)
  })

  it('creates all required subdirectories for imported system', async () => {
    const bundle: ExportedSystem = {
      system: {
        id: 'old-id',
        name: 'Dir Test',
        inputs: [],
        outputs: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      },
      schemas: [],
      environments: [],
      profiles: [],
      templates: [],
      templateFolders: [],
      customTypes: []
    }

    const result = await api.import(bundle)
    const systemDir = path.join(tmpDir, 'systems', result.id)

    for (const subDir of ['schemas', 'environments', 'profiles', 'custom-types', 'templates', 'sessions']) {
      const stat = await fs.stat(path.join(systemDir, subDir))
      expect(stat.isDirectory()).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// export → import round-trip
// ---------------------------------------------------------------------------

describe('SystemsApi — export → import round-trip', () => {
  it('imported system is functionally equivalent to the exported one', async () => {
    // Create a fully-populated source system
    const source = await api.create({
      name: 'Source System',
      description: 'For export',
      inputs: [kinesisInput],
      outputs: [sqsOutput]
    })
    const inputId = source.inputs[0].id

    const customType: CustomDataType = {
      id: 'ctype-rt',
      systemId: source.id,
      name: 'OrderId',
      baseType: 'string',
      defaultStrategy: { type: 'pattern', config: { pattern: 'ORD-[A-Z0-9]{8}' } }
    }
    await writeCustomType(storage, tmpDir, source.id, customType)

    const schema: Schema = {
      id: 'schema-rt',
      systemId: source.id,
      name: 'OrderPlaced',
      elements: [
        {
          name: 'orderId',
          required: true,
          dataType: { type: 'ctype-rt', customTypeId: 'ctype-rt' },
          generationStrategy: { type: 'pattern', config: { pattern: 'ORD-X' } }
        }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeSchema(storage, tmpDir, source.id, schema)

    const env: Environment = {
      id: 'env-rt',
      systemId: source.id,
      name: 'Prod',
      variables: [
        { key: 'REGION', value: 'us-east-1', sensitive: false },
        { key: 'SECRET', value: 'top-secret', sensitive: true }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeEnvironment(storage, tmpDir, source.id, env)

    const profile: Profile = {
      id: 'profile-rt',
      systemId: source.id,
      name: 'High Value',
      overrides: [{ elementPath: 'amount', action: 'set', value: 9000 }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeProfile(storage, tmpDir, source.id, profile)

    const folder: TemplateFolder = {
      id: 'folder-rt',
      systemId: source.id,
      parentId: null,
      name: 'Orders'
    }
    await writeTemplateFolders(storage, tmpDir, source.id, [folder])

    const template: Template = {
      id: 'tmpl-rt',
      systemId: source.id,
      folderId: 'folder-rt',
      name: 'Standard Order',
      schemaId: 'schema-rt',
      inputId,
      profileIds: ['profile-rt'],
      fields: [{ elementPath: 'currency', action: 'set', value: 'USD' }],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    }
    await writeTemplate(storage, tmpDir, source.id, template)

    // Export
    const exported = await api.export(source.id)

    // Verify sensitive value is masked in export
    expect(exported.environments[0].variables[1].value).toBe('')

    // Import
    const imported = await api.import(exported)

    // Verify imported system has a different ID
    expect(imported.id).not.toBe(source.id)
    expect(imported.name).toBe(source.name)
    expect(imported.description).toBe(source.description)

    // Verify inputs/outputs have new IDs but same config
    expect(imported.inputs[0].id).not.toBe(inputId)
    expect(imported.inputs[0].name).toBe(kinesisInput.name)
    expect(imported.outputs[0].name).toBe(sqsOutput.name)

    const newInputId = imported.inputs[0].id

    // Retrieve and verify imported schema does NOT exist under the old ID
    const schemasDir = path.join(tmpDir, 'systems', imported.id, 'schemas')
    const schemaFiles = await fs.readdir(schemasDir)
    expect(schemaFiles).toHaveLength(1)
    const newSchemaId = schemaFiles[0].slice(0, -5)
    expect(newSchemaId).not.toBe('schema-rt')

    // Verify template FK references are remapped
    const templatesDir = path.join(tmpDir, 'systems', imported.id, 'templates')
    const templateFiles = (await fs.readdir(templatesDir)).filter(
      (f) => f.endsWith('.json') && f !== 'folders.json'
    )
    expect(templateFiles).toHaveLength(1)
    const savedTemplate = await storage.read<Template>(
      StoragePaths.template(tmpDir, imported.id, templateFiles[0].slice(0, -5))
    )
    expect(savedTemplate!.schemaId).toBe(newSchemaId)
    expect(savedTemplate!.inputId).toBe(newInputId)
    expect(savedTemplate!.profileIds[0]).toMatch(UUID_RE)
    expect(savedTemplate!.profileIds[0]).not.toBe('profile-rt')
    expect(savedTemplate!.folderId).toMatch(UUID_RE)
    expect(savedTemplate!.folderId).not.toBe('folder-rt')

    // Verify the imported system is now retrievable in the list
    const allSystems = await api.list()
    expect(allSystems.find((s) => s.id === imported.id)).toBeDefined()
    expect(allSystems.find((s) => s.id === source.id)).toBeDefined()
  })
})
