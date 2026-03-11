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
import { SystemsApi } from '../../../../src/main/api/systems'
import type { System } from '../../../../src/shared/models'
import type { CreateSystemInput } from '../../../../src/shared/dto'

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let api: SystemsApi

const kinesisInput: Omit<import('../../../../src/shared/models').InputConfig, 'id'> = {
  name: 'My Input',
  type: 'kinesis',
  config: { streamName: 'my-stream', region: 'us-east-1' }
}

const sqsOutput: Omit<import('../../../../src/shared/models').OutputConfig, 'id'> = {
  name: 'My Output',
  type: 'sqs',
  config: { queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/q', region: 'us-east-1' }
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
