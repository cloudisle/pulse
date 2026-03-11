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
import { ProfilesApi } from '../../../../src/main/api/profiles'
import type { Profile, ProfileOverride } from '../../../../src/shared/models/profile'
import type { Template } from '../../../../src/shared/models/template'

let tmpDir: string
let storage: StorageService
let api: ProfilesApi

const SYS_ID = 'sys-1'

const OVERRIDES: ProfileOverride[] = [
  { elementPath: 'payload.status', action: 'set', value: 'active' },
  { elementPath: 'payload.orderId', action: 'generate', generationStrategy: 'uuid' }
]

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-profiles-test-'))
  storage = new StorageService()
  const settings = new SettingsService(storage, tmpDir)
  api = new ProfilesApi(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('ProfilesApi — create', () => {
  it('returns a Profile with a generated id', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'Default', overrides: [] })

    expect(profile.id).toBeTruthy()
    expect(typeof profile.id).toBe('string')
  })

  it('persists the profile to disk', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'Default', overrides: OVERRIDES })

    const filePath = StoragePaths.profile(tmpDir, SYS_ID, profile.id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as Profile

    expect(persisted.name).toBe('Default')
    expect(persisted.id).toBe(profile.id)
  })

  it('sets createdAt and updatedAt to the same ISO timestamp', async () => {
    const before = new Date().toISOString()
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [] })
    const after = new Date().toISOString()

    expect(profile.createdAt >= before).toBe(true)
    expect(profile.createdAt <= after).toBe(true)
    expect(profile.createdAt).toBe(profile.updatedAt)
  })

  it('stores the systemId on the returned object', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [] })

    expect(profile.systemId).toBe(SYS_ID)
  })

  it('stores an optional description when provided', async () => {
    const profile = await api.create({
      systemId: SYS_ID,
      name: 'P',
      description: 'A test profile',
      overrides: []
    })

    expect(profile.description).toBe('A test profile')
  })

  it('stores overrides with action "set" correctly', async () => {
    const override: ProfileOverride = { elementPath: 'items[0].sku', action: 'set', value: 'SKU-99' }
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [override] })

    expect(profile.overrides[0]).toEqual(override)
  })

  it('stores overrides with action "generate" correctly', async () => {
    const override: ProfileOverride = {
      elementPath: 'orderId',
      action: 'generate',
      generationStrategy: 'uuid'
    }
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [override] })

    expect(profile.overrides[0]).toEqual(override)
  })

  it('stores overrides with action "omit" correctly', async () => {
    const override: ProfileOverride = { elementPath: 'payload.secret', action: 'omit' }
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [override] })

    expect(profile.overrides[0]).toEqual(override)
  })

  it('stores overrides with action "nullify" correctly', async () => {
    const override: ProfileOverride = { elementPath: 'payload.optional', action: 'nullify' }
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [override] })

    expect(profile.overrides[0]).toEqual(override)
  })

  it('stores overrides with action "require" correctly', async () => {
    const override: ProfileOverride = { elementPath: 'payload.required', action: 'require' }
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [override] })

    expect(profile.overrides[0]).toEqual(override)
  })

  it('persists all override action types together', async () => {
    const overrides: ProfileOverride[] = [
      { elementPath: 'a', action: 'set', value: 1 },
      { elementPath: 'b', action: 'generate', generationStrategy: 'uuid' },
      { elementPath: 'c', action: 'omit' },
      { elementPath: 'd', action: 'nullify' },
      { elementPath: 'e', action: 'require' }
    ]
    const profile = await api.create({ systemId: SYS_ID, name: 'Multi', overrides })

    const filePath = StoragePaths.profile(tmpDir, SYS_ID, profile.id)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Profile

    expect(persisted.overrides).toHaveLength(5)
    expect(persisted.overrides.map((o) => o.action).sort()).toEqual([
      'generate',
      'nullify',
      'omit',
      'require',
      'set'
    ])
  })
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('ProfilesApi — list', () => {
  it('returns an empty array when no profiles exist', async () => {
    const result = await api.list(SYS_ID)

    expect(result).toEqual([])
  })

  it('returns all created profiles for a system', async () => {
    await api.create({ systemId: SYS_ID, name: 'Profile A', overrides: [] })
    await api.create({ systemId: SYS_ID, name: 'Profile B', overrides: [] })

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(2)
    expect(result.map((p) => p.name).sort()).toEqual(['Profile A', 'Profile B'])
  })

  it('does not return profiles from a different system', async () => {
    await api.create({ systemId: SYS_ID, name: 'Profile A', overrides: [] })
    await api.create({ systemId: 'sys-2', name: 'Profile B', overrides: [] })

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Profile A')
  })

  it('ignores non-JSON files in the profiles directory', async () => {
    await api.create({ systemId: SYS_ID, name: 'Profile A', overrides: [] })

    const profilesDir = path.join(tmpDir, 'systems', SYS_ID, 'profiles')
    await fs.writeFile(path.join(profilesDir, 'README.txt'), 'ignore me', 'utf-8')

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('ProfilesApi — get', () => {
  it('returns the profile by systemId and id', async () => {
    const created = await api.create({ systemId: SYS_ID, name: 'Default', overrides: OVERRIDES })

    const result = await api.get(SYS_ID, created.id)

    expect(result).toEqual(created)
  })

  it('throws when the profile does not exist', async () => {
    await expect(api.get(SYS_ID, 'non-existent-id')).rejects.toThrow(
      'Profile not found: non-existent-id'
    )
  })
})

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('ProfilesApi — update', () => {
  it('updates the name and returns the updated profile', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'Old Name', overrides: [] })

    const updated = await api.update(SYS_ID, profile.id, { name: 'New Name' })

    expect(updated.name).toBe('New Name')
    expect(updated.id).toBe(profile.id)
    expect(updated.systemId).toBe(SYS_ID)
  })

  it('updates the description', async () => {
    const profile = await api.create({
      systemId: SYS_ID,
      name: 'P',
      description: 'Old',
      overrides: []
    })

    const updated = await api.update(SYS_ID, profile.id, { description: 'New desc' })

    expect(updated.description).toBe('New desc')
  })

  it('updates overrides', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: OVERRIDES })

    const newOverrides: ProfileOverride[] = [{ elementPath: 'x', action: 'omit' }]
    const updated = await api.update(SYS_ID, profile.id, { overrides: newOverrides })

    expect(updated.overrides).toEqual(newOverrides)
  })

  it('preserves fields not included in the update', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: OVERRIDES })

    const updated = await api.update(SYS_ID, profile.id, { name: 'Renamed' })

    expect(updated.overrides).toEqual(OVERRIDES)
    expect(updated.createdAt).toBe(profile.createdAt)
  })

  it('updates updatedAt but not createdAt', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [] })

    await new Promise((r) => setTimeout(r, 5))
    const updated = await api.update(SYS_ID, profile.id, { name: 'Changed' })

    expect(updated.createdAt).toBe(profile.createdAt)
    expect(updated.updatedAt >= profile.updatedAt).toBe(true)
  })

  it('persists the update to disk', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'P', overrides: [] })

    await api.update(SYS_ID, profile.id, { name: 'Persisted' })

    const filePath = StoragePaths.profile(tmpDir, SYS_ID, profile.id)
    const persisted = JSON.parse(await fs.readFile(filePath, 'utf-8')) as Profile
    expect(persisted.name).toBe('Persisted')
  })

  it('throws when the profile does not exist', async () => {
    await expect(api.update(SYS_ID, 'missing-id', { name: 'X' })).rejects.toThrow(
      'Profile not found: missing-id'
    )
  })
})

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('ProfilesApi — delete', () => {
  it('removes the profile file from disk', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'ToDelete', overrides: [] })
    const filePath = StoragePaths.profile(tmpDir, SYS_ID, profile.id)

    await api.delete(SYS_ID, profile.id)

    await expect(fs.access(filePath)).rejects.toThrow()
  })

  it('profile is no longer returned by list after deletion', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'ToDelete', overrides: [] })

    await api.delete(SYS_ID, profile.id)

    const result = await api.list(SYS_ID)
    expect(result.find((p) => p.id === profile.id)).toBeUndefined()
  })

  it('does not throw when deleting a non-existent profile', async () => {
    await expect(api.delete(SYS_ID, 'non-existent-id')).resolves.toBeUndefined()
  })

  it('emits a console.warn when a template references the profile', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'Referenced', overrides: [] })

    // write a template that references this profile
    const template: Template = {
      id: 'tmpl-1',
      systemId: SYS_ID,
      folderId: null,
      name: 'Order Template',
      schemaId: 'schema-1',
      inputId: 'input-1',
      profileIds: [profile.id],
      fields: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await storage.write(StoragePaths.template(tmpDir, SYS_ID, template.id), template)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await api.delete(SYS_ID, profile.id)

    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain(profile.id)
    expect(warnSpy.mock.calls[0][0]).toContain('Order Template')

    warnSpy.mockRestore()
  })

  it('does not warn when no templates reference the profile', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'Unreferenced', overrides: [] })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await api.delete(SYS_ID, profile.id)

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('does not warn when a template references a different profile', async () => {
    const profile = await api.create({ systemId: SYS_ID, name: 'P1', overrides: [] })
    const other = await api.create({ systemId: SYS_ID, name: 'P2', overrides: [] })

    const template: Template = {
      id: 'tmpl-2',
      systemId: SYS_ID,
      folderId: null,
      name: 'Other Template',
      schemaId: 'schema-1',
      inputId: 'input-1',
      profileIds: [other.id],
      fields: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    await storage.write(StoragePaths.template(tmpDir, SYS_ID, template.id), template)

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await api.delete(SYS_ID, profile.id)

    expect(warnSpy).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })
})
