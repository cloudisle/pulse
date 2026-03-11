import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { StorageService, StoragePaths } from '../../../src/main/services/storage'
import { SettingsService } from '../../../src/main/services/settings.service'
import type { AppSettings } from '../../../src/shared/models/settings'

let tmpDir: string
let storage: StorageService
let service: SettingsService

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-settings-test-'))
  storage = new StorageService()
  service = new SettingsService(storage, tmpDir)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('SettingsService — getDataPath', () => {
  it('returns the data directory passed to the constructor', async () => {
    expect(await service.getDataPath()).toBe(tmpDir)
  })

  it('defaults to app.getPath("userData")/data when no dataDir is provided', async () => {
    const defaultService = new SettingsService(storage)
    expect(await defaultService.getDataPath()).toBe('/mock/userData/data')
  })
})

describe('SettingsService — getSettings (default creation)', () => {
  it('creates settings.json with defaults on first call', async () => {
    const settings = await service.getSettings()

    expect(settings.sessionHistoryLimit).toBe(10)
    expect(settings.defaultRegion).toBe('us-east-1')
    expect(settings.theme).toBe('dark')
    expect(settings.logLevel).toBe('info')
    expect(settings.dataDirectory).toBe(tmpDir)
  })

  it('persists settings.json to disk on first call', async () => {
    await service.getSettings()

    const filePath = StoragePaths.settings(tmpDir)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as AppSettings

    expect(persisted.sessionHistoryLimit).toBe(10)
    expect(persisted.defaultRegion).toBe('us-east-1')
    expect(persisted.theme).toBe('dark')
    expect(persisted.logLevel).toBe('info')
    expect(persisted.dataDirectory).toBe(tmpDir)
  })
})

describe('SettingsService — getSettings (subsequent reads)', () => {
  it('returns the previously persisted settings on subsequent calls', async () => {
    await service.getSettings()

    // Manually mutate the persisted file
    const filePath = StoragePaths.settings(tmpDir)
    const modified: AppSettings = {
      sessionHistoryLimit: 25,
      defaultRegion: 'eu-west-1',
      theme: 'light',
      logLevel: 'debug',
      dataDirectory: tmpDir
    }
    await storage.write(filePath, modified)

    const result = await service.getSettings()

    expect(result).toEqual(modified)
  })
})

describe('SettingsService — updateSettings', () => {
  it('merges a partial update and persists the result', async () => {
    await service.getSettings()

    const updated = await service.updateSettings({ theme: 'light' })

    expect(updated.theme).toBe('light')
    // Other fields remain unchanged
    expect(updated.sessionHistoryLimit).toBe(10)
    expect(updated.defaultRegion).toBe('us-east-1')
    expect(updated.logLevel).toBe('info')
    expect(updated.dataDirectory).toBe(tmpDir)
  })

  it('persists the merged settings to disk', async () => {
    await service.getSettings()
    await service.updateSettings({ theme: 'light' })

    const filePath = StoragePaths.settings(tmpDir)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as AppSettings

    expect(persisted.theme).toBe('light')
  })

  it('handles multiple partial updates cumulatively', async () => {
    await service.getSettings()

    await service.updateSettings({ theme: 'light' })
    const final = await service.updateSettings({ sessionHistoryLimit: 50 })

    expect(final.theme).toBe('light')
    expect(final.sessionHistoryLimit).toBe(50)
  })
})

describe('SettingsService — full round-trip', () => {
  it('creates defaults, updates, then reads back correctly', async () => {
    // 1. First call creates defaults
    const initial = await service.getSettings()
    expect(initial.theme).toBe('dark')

    // 2. Update a setting
    await service.updateSettings({ theme: 'system', defaultRegion: 'ap-southeast-1' })

    // 3. A fresh service instance reading the same directory returns updated values
    const freshService = new SettingsService(storage, tmpDir)
    const result = await freshService.getSettings()

    expect(result.theme).toBe('system')
    expect(result.defaultRegion).toBe('ap-southeast-1')
    expect(result.sessionHistoryLimit).toBe(10)
    expect(result.logLevel).toBe('info')
  })
})
