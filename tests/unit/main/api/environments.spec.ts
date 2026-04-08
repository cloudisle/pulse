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
import { EnvironmentsApi } from '@main/api/environments'
import type { Environment, EnvironmentVariable } from '@shared/models'

let tmpDir: string
let storage: StorageService
let api: EnvironmentsApi

const SYS_ID = 'sys-1'

const VARS: EnvironmentVariable[] = [
  { key: 'API_KEY', value: 'abc123', sensitive: true },
  { key: 'REGION', value: 'us-east-1', sensitive: false }
]

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-env-test-'))
  storage = new StorageService()
  const settings = new SettingsService(storage, tmpDir)
  api = new EnvironmentsApi(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('EnvironmentsApi — create', () => {
  it('returns an Environment with a generated id', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Staging', variables: VARS })

    expect(env.id).toBeTruthy()
    expect(typeof env.id).toBe('string')
  })

  it('persists the environment to disk', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Staging', variables: VARS })

    const filePath = StoragePaths.environment(tmpDir, SYS_ID, env.id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as Environment

    expect(persisted.name).toBe('Staging')
    expect(persisted.id).toBe(env.id)
  })

  it('sets createdAt and updatedAt to the same ISO timestamp', async () => {
    const before = new Date().toISOString()
    const env = await api.create({ systemId: SYS_ID, name: 'Prod', variables: [] })
    const after = new Date().toISOString()

    expect(env.createdAt >= before).toBe(true)
    expect(env.createdAt <= after).toBe(true)
    expect(env.createdAt).toBe(env.updatedAt)
  })

  it('persists sensitive EnvironmentVariable flag correctly', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Dev', variables: VARS })

    const filePath = StoragePaths.environment(tmpDir, SYS_ID, env.id)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Environment

    expect(persisted.variables).toHaveLength(2)
    expect(persisted.variables[0].sensitive).toBe(true)
    expect(persisted.variables[1].sensitive).toBe(false)
  })

  it('stores the systemId on the returned object', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'QA', variables: [] })

    expect(env.systemId).toBe(SYS_ID)
  })
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('EnvironmentsApi — list', () => {
  it('returns an empty array when no environments exist', async () => {
    const result = await api.list(SYS_ID)

    expect(result).toEqual([])
  })

  it('returns all created environments for a system', async () => {
    await api.create({ systemId: SYS_ID, name: 'Env A', variables: [] })
    await api.create({ systemId: SYS_ID, name: 'Env B', variables: [] })

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(2)
    expect(result.map((e) => e.name).sort()).toEqual(['Env A', 'Env B'])
  })

  it('does not return environments from a different system', async () => {
    await api.create({ systemId: SYS_ID, name: 'Env A', variables: [] })
    await api.create({ systemId: 'sys-2', name: 'Env B', variables: [] })

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Env A')
  })

  it('ignores non-JSON files in the environments directory', async () => {
    await api.create({ systemId: SYS_ID, name: 'Env A', variables: [] })

    const envDir = path.join(tmpDir, 'systems', SYS_ID, 'environments')
    await fs.writeFile(path.join(envDir, 'README.txt'), 'ignore me', 'utf-8')

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('EnvironmentsApi — get', () => {
  it('returns the environment by systemId and id', async () => {
    const created = await api.create({ systemId: SYS_ID, name: 'Staging', variables: VARS })

    const result = await api.get(SYS_ID, created.id)

    expect(result).toEqual(created)
  })

  it('throws when the environment does not exist', async () => {
    await expect(api.get(SYS_ID, 'non-existent-id')).rejects.toThrow(
      'Environment not found: non-existent-id'
    )
  })
})

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('EnvironmentsApi — update', () => {
  it('updates the name and returns the updated environment', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Old Name', variables: [] })

    const updated = await api.update(SYS_ID, env.id, { name: 'New Name' })

    expect(updated.name).toBe('New Name')
    expect(updated.id).toBe(env.id)
    expect(updated.systemId).toBe(SYS_ID)
  })

  it('updates variables and returns the updated environment', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Env', variables: VARS })

    const newVars: EnvironmentVariable[] = [{ key: 'NEW_KEY', value: 'new_val', sensitive: false }]
    const updated = await api.update(SYS_ID, env.id, { variables: newVars })

    expect(updated.variables).toEqual(newVars)
  })

  it('allows adding a variable', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Env', variables: VARS })

    const extended = [...VARS, { key: 'EXTRA', value: 'x', sensitive: false }]
    const updated = await api.update(SYS_ID, env.id, { variables: extended })

    expect(updated.variables).toHaveLength(3)
  })

  it('allows removing a variable', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Env', variables: VARS })

    const updated = await api.update(SYS_ID, env.id, { variables: [VARS[0]] })

    expect(updated.variables).toHaveLength(1)
    expect(updated.variables[0].key).toBe('API_KEY')
  })

  it('allows modifying a variable value and sensitive flag', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Env', variables: VARS })

    const modified: EnvironmentVariable[] = [
      { key: 'API_KEY', value: 'new-secret', sensitive: false }
    ]
    const updated = await api.update(SYS_ID, env.id, { variables: modified })

    expect(updated.variables[0].value).toBe('new-secret')
    expect(updated.variables[0].sensitive).toBe(false)
  })

  it('preserves fields not included in the update', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Env', variables: VARS })

    const updated = await api.update(SYS_ID, env.id, { name: 'Renamed' })

    expect(updated.variables).toEqual(VARS)
    expect(updated.createdAt).toBe(env.createdAt)
  })

  it('updates updatedAt but not createdAt', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Env', variables: [] })

    await new Promise((r) => setTimeout(r, 5))
    const updated = await api.update(SYS_ID, env.id, { name: 'Changed' })

    expect(updated.createdAt).toBe(env.createdAt)
    expect(updated.updatedAt >= env.updatedAt).toBe(true)
  })

  it('persists the update to disk', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'Env', variables: [] })

    await api.update(SYS_ID, env.id, { name: 'Persisted' })

    const filePath = StoragePaths.environment(tmpDir, SYS_ID, env.id)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Environment
    expect(persisted.name).toBe('Persisted')
  })

  it('throws when the environment does not exist', async () => {
    await expect(api.update(SYS_ID, 'missing-id', { name: 'X' })).rejects.toThrow(
      'Environment not found: missing-id'
    )
  })
})

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('EnvironmentsApi — delete', () => {
  it('removes the environment file from disk', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'ToDelete', variables: [] })
    const filePath = StoragePaths.environment(tmpDir, SYS_ID, env.id)

    await api.delete(SYS_ID, env.id)

    await expect(fs.access(filePath)).rejects.toThrow()
  })

  it('environment is no longer returned by list after deletion', async () => {
    const env = await api.create({ systemId: SYS_ID, name: 'ToDelete', variables: [] })

    await api.delete(SYS_ID, env.id)

    const result = await api.list(SYS_ID)
    expect(result.find((e) => e.id === env.id)).toBeUndefined()
  })

  it('does not throw when deleting a non-existent environment', async () => {
    await expect(api.delete(SYS_ID, 'non-existent-id')).resolves.toBeUndefined()
  })
})
