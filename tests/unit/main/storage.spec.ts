import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { StorageService, StoragePaths } from '../../../src/main/services/storage'

let tmpDir: string
let service: StorageService

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-storage-test-'))
  service = new StorageService()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('StorageService — read', () => {
  it('reads and parses an existing JSON file', async () => {
    const filePath = path.join(tmpDir, 'test.json')
    await fs.writeFile(filePath, JSON.stringify({ hello: 'world' }), 'utf-8')

    const result = await service.read<{ hello: string }>(filePath)

    expect(result).toEqual({ hello: 'world' })
  })

  it('returns null when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.json')

    const result = await service.read(filePath)

    expect(result).toBeNull()
  })
})

describe('StorageService — write', () => {
  it('writes data as JSON to a new file', async () => {
    const filePath = path.join(tmpDir, 'output.json')
    const data = { id: 'abc', value: 42 }

    await service.write(filePath, data)

    const raw = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(raw)).toEqual(data)
  })

  it('overwrites an existing file', async () => {
    const filePath = path.join(tmpDir, 'output.json')
    await fs.writeFile(filePath, JSON.stringify({ old: true }), 'utf-8')

    await service.write(filePath, { new: true })

    const raw = await fs.readFile(filePath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({ new: true })
  })

  it('writes atomically (no leftover temp file)', async () => {
    const filePath = path.join(tmpDir, 'atomic.json')

    await service.write(filePath, { x: 1 })

    const files = await fs.readdir(tmpDir)
    expect(files).not.toContain('atomic.json.tmp')
    expect(files).toContain('atomic.json')
  })
})

describe('StorageService — delete', () => {
  it('deletes an existing file', async () => {
    const filePath = path.join(tmpDir, 'to-delete.json')
    await fs.writeFile(filePath, '{}', 'utf-8')

    await service.delete(filePath)

    await expect(fs.access(filePath)).rejects.toThrow()
  })

  it('does not throw when deleting a non-existent file', async () => {
    const filePath = path.join(tmpDir, 'does-not-exist.json')

    await expect(service.delete(filePath)).resolves.toBeUndefined()
  })
})

describe('StorageService — exists', () => {
  it('returns true when file exists', async () => {
    const filePath = path.join(tmpDir, 'present.json')
    await fs.writeFile(filePath, '{}', 'utf-8')

    expect(await service.exists(filePath)).toBe(true)
  })

  it('returns false when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'absent.json')

    expect(await service.exists(filePath)).toBe(false)
  })
})

describe('StorageService — listDir', () => {
  it('lists files in a directory', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.json'), '{}')
    await fs.writeFile(path.join(tmpDir, 'b.json'), '{}')

    const files = await service.listDir(tmpDir)

    expect(files.sort()).toEqual(['a.json', 'b.json'])
  })
})

describe('StorageService — ensureDir', () => {
  it('creates a directory that does not exist', async () => {
    const dirPath = path.join(tmpDir, 'nested', 'deep', 'dir')

    await service.ensureDir(dirPath)

    const stat = await fs.stat(dirPath)
    expect(stat.isDirectory()).toBe(true)
  })

  it('does not throw when directory already exists', async () => {
    await expect(service.ensureDir(tmpDir)).resolves.toBeUndefined()
  })
})

describe('StoragePaths', () => {
  const dataDir = '/data'
  const systemId = 'sys-1'

  it('generates the settings path', () => {
    expect(StoragePaths.settings(dataDir)).toBe('/data/settings.json')
  })

  it('generates the system path', () => {
    expect(StoragePaths.system(dataDir, systemId)).toBe('/data/systems/sys-1/system.json')
  })

  it('generates the schema path', () => {
    expect(StoragePaths.schema(dataDir, systemId, 'sch-1')).toBe(
      '/data/systems/sys-1/schemas/sch-1.json'
    )
  })

  it('generates the environment path', () => {
    expect(StoragePaths.environment(dataDir, systemId, 'env-1')).toBe(
      '/data/systems/sys-1/environments/env-1.json'
    )
  })

  it('generates the profile path', () => {
    expect(StoragePaths.profile(dataDir, systemId, 'prof-1')).toBe(
      '/data/systems/sys-1/profiles/prof-1.json'
    )
  })

  it('generates the custom-type path', () => {
    expect(StoragePaths.customType(dataDir, systemId, 'ctype-1')).toBe(
      '/data/systems/sys-1/custom-types/ctype-1.json'
    )
  })

  it('generates the template path', () => {
    expect(StoragePaths.template(dataDir, systemId, 'tmpl-1')).toBe(
      '/data/systems/sys-1/templates/tmpl-1.json'
    )
  })

  it('generates the template folders path', () => {
    expect(StoragePaths.templateFolders(dataDir, systemId)).toBe(
      '/data/systems/sys-1/templates/folders.json'
    )
  })

  it('generates the session path', () => {
    expect(StoragePaths.session(dataDir, systemId, 'sess-1')).toBe(
      '/data/systems/sys-1/sessions/sess-1/session.json'
    )
  })

  it('generates the session event path', () => {
    expect(StoragePaths.sessionEvent(dataDir, systemId, 'sess-1', 'evt-1')).toBe(
      '/data/systems/sys-1/sessions/sess-1/events/evt-1.json'
    )
  })

  it('generates the session logs path', () => {
    expect(StoragePaths.sessionLogs(dataDir, systemId, 'sess-1')).toBe(
      '/data/systems/sys-1/sessions/sess-1/logs.json'
    )
  })
})
