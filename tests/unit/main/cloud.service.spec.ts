import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { CloudService, PutMode } from '../../../src/main/services/cloud.service'
import { SettingsService } from '../../../src/main/services/settings.service'
import { StorageService } from '../../../src/main/services/storage'

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let cloud: CloudService

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-cloud-test-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)
  cloud = new CloudService(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('CloudService — get', () => {
  it('returns undefined for a missing key', async () => {
    await expect(cloud.get('aws', 'profile')).resolves.toBeUndefined()
  })

  it('returns merged platform settings for aws profile retrieval', async () => {
    await cloud.putAll('aws', { profile: 'dev-admin' })

    await expect(cloud.get('aws', 'profile')).resolves.toBe('dev-admin')
    await expect(cloud.get('aws')).resolves.toEqual({ profile: 'dev-admin' })
  })
})

describe('CloudService — put and putAll', () => {
  it('put stores a single value under the provided key', async () => {
    await cloud.put('aws', 'profile', { profile: 'qa-admin' })

    await expect(cloud.get('aws', 'profile')).resolves.toBe('qa-admin')
  })

  it('putAll merges by default', async () => {
    await cloud.putAll('aws', { profile: 'default', region: 'us-east-1' })
    await cloud.putAll('aws', { region: 'eu-west-1' })

    await expect(cloud.get('aws')).resolves.toEqual({
      profile: 'default',
      region: 'eu-west-1'
    })
  })

  it('putAll replaces when mode is REPLACE', async () => {
    await cloud.putAll('aws', { profile: 'default', region: 'us-east-1' })
    await cloud.putAll('aws', { profile: 'prod' }, PutMode.REPLACE)

    await expect(cloud.get('aws')).resolves.toEqual({ profile: 'prod' })
  })
})

