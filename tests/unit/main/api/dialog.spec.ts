import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn()
  },
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { dialog } from 'electron'
import { DialogApi } from '../../../../src/main/api/dialog'

let tmpDir: string
let api: DialogApi

const mockWindow: any = { id: 1 }

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-dialog-test-'))
  api = new DialogApi()
  api.setBrowserWindow(mockWindow)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// showSaveDialog
// ---------------------------------------------------------------------------

describe('DialogApi — showSaveDialog', () => {
  it('delegates to electron dialog.showSaveDialog and returns result', async () => {
    const mockResult = { canceled: false, filePath: '/tmp/system.json' }
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce(mockResult as any)

    const result = await api.showSaveDialog({
      title: 'Save System',
      defaultPath: 'system.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })

    expect(dialog.showSaveDialog).toHaveBeenCalledWith(mockWindow, {
      title: 'Save System',
      defaultPath: 'system.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    expect(result.canceled).toBe(false)
    expect(result.filePath).toBe('/tmp/system.json')
  })

  it('returns canceled:true when user cancels', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({ canceled: true, filePath: undefined } as any)

    const result = await api.showSaveDialog({})

    expect(result.canceled).toBe(true)
    expect(result.filePath).toBeUndefined()
  })

  it('throws when BrowserWindow is not set', async () => {
    const uninitialized = new DialogApi()
    await expect(uninitialized.showSaveDialog({})).rejects.toThrow('BrowserWindow not set')
  })
})

// ---------------------------------------------------------------------------
// showOpenDialog
// ---------------------------------------------------------------------------

describe('DialogApi — showOpenDialog', () => {
  it('delegates to electron dialog.showOpenDialog and returns result', async () => {
    const mockResult = { canceled: false, filePaths: ['/tmp/system.json'] }
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce(mockResult as any)

    const result = await api.showOpenDialog({
      title: 'Open System',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })

    expect(dialog.showOpenDialog).toHaveBeenCalledWith(mockWindow, {
      title: 'Open System',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    })
    expect(result.canceled).toBe(false)
    expect(result.filePaths).toEqual(['/tmp/system.json'])
  })

  it('defaults properties to openFile when not specified', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: [] } as any)

    await api.showOpenDialog({})

    const callArgs = vi.mocked(dialog.showOpenDialog).mock.calls[0][1]
    expect(callArgs.properties).toEqual(['openFile'])
  })

  it('passes custom properties when specified', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: [] } as any)

    await api.showOpenDialog({ properties: ['openFile', 'multiSelections'] })

    const callArgs = vi.mocked(dialog.showOpenDialog).mock.calls[0][1]
    expect(callArgs.properties).toEqual(['openFile', 'multiSelections'])
  })

  it('returns canceled:true when user cancels', async () => {
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: true, filePaths: [] } as any)

    const result = await api.showOpenDialog({})

    expect(result.canceled).toBe(true)
    expect(result.filePaths).toEqual([])
  })

  it('throws when BrowserWindow is not set', async () => {
    const uninitialized = new DialogApi()
    await expect(uninitialized.showOpenDialog({})).rejects.toThrow('BrowserWindow not set')
  })
})

// ---------------------------------------------------------------------------
// writeTextFile / readTextFile
// ---------------------------------------------------------------------------

describe('DialogApi — writeTextFile', () => {
  it('writes content to the specified path', async () => {
    const filePath = path.join(tmpDir, 'output.json')
    await api.writeTextFile(filePath, '{"hello":"world"}')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('{"hello":"world"}')
  })

  it('overwrites existing file content', async () => {
    const filePath = path.join(tmpDir, 'output.json')
    await fs.writeFile(filePath, 'old content', 'utf-8')

    await api.writeTextFile(filePath, 'new content')

    const content = await fs.readFile(filePath, 'utf-8')
    expect(content).toBe('new content')
  })
})

describe('DialogApi — readTextFile', () => {
  it('reads content from the specified path', async () => {
    const filePath = path.join(tmpDir, 'input.json')
    await fs.writeFile(filePath, '{"key":"value"}', 'utf-8')

    const content = await api.readTextFile(filePath)
    expect(content).toBe('{"key":"value"}')
  })

  it('throws when file does not exist', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.json')
    await expect(api.readTextFile(filePath)).rejects.toThrow()
  })
})
