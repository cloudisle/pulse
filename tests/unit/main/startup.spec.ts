import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { BrowserWindow, IpcMain, WebContents } from 'electron'
import type { App, AppConfig } from '../../../src/app/index'
import type { SettingsService } from '../../../src/main/services/settings.service'
import type { PushService } from '../../../src/main/services/push.service'
import type { LogService } from '../../../src/main/services/log.service'
import { runStartup } from '../../../src/main/startup'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeWebContents(): WebContents {
  return { send: vi.fn() } as unknown as WebContents
}

function makeWindow(webContents?: WebContents): BrowserWindow {
  return {
    webContents: webContents ?? makeWebContents(),
  } as unknown as BrowserWindow
}

function makeIpcMain(): IpcMain {
  return { handle: vi.fn() } as unknown as IpcMain
}

function makeAppInstance(): App<AppConfig> {
  return { initialize: vi.fn() } as unknown as App<AppConfig>
}

function makeSettings(getSettingsImpl?: () => Promise<any>): SettingsService {
  return {
    getSettings: getSettingsImpl ?? vi.fn().mockResolvedValue({ theme: 'dark' }),
  } as unknown as SettingsService
}

function makePushService(): PushService {
  return { initialize: vi.fn() } as unknown as PushService
}

function makeLogService(): LogService {
  return { initialize: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) } as unknown as LogService
}

// ─── call-order tracking ─────────────────────────────────────────────────────

describe('runStartup — startup sequence ordering', () => {
  let callOrder: string[]
  let webContents: WebContents
  let mainWindow: BrowserWindow
  let ipcMain: IpcMain
  let appInstance: App<AppConfig>
  let settingsService: SettingsService
  let pushService: PushService
  let logService: LogService
  let createWindow: () => Promise<BrowserWindow>

  beforeEach(() => {
    callOrder = []
    webContents = makeWebContents()
    mainWindow = makeWindow(webContents)
    ipcMain = makeIpcMain()
    appInstance = makeAppInstance()

    settingsService = {
      getSettings: vi.fn().mockImplementation(async () => {
        callOrder.push('settings.getSettings')
        return { theme: 'dark' }
      }),
    } as unknown as SettingsService

    pushService = {
      initialize: vi.fn().mockImplementation((wc: WebContents) => {
        callOrder.push('pushService.initialize')
        return wc
      }),
    } as unknown as PushService

    logService = {
      initialize: vi.fn().mockImplementation(() => {
        callOrder.push('logService.initialize')
      }),
      flush: vi.fn().mockResolvedValue(undefined),
    } as unknown as LogService

    vi.mocked(appInstance.initialize).mockImplementation(() => {
      callOrder.push('app.initialize')
      return {} as AppConfig
    })

    createWindow = vi.fn().mockImplementation(async () => {
      callOrder.push('createWindow')
      return mainWindow
    })
  })

  it('loads settings before creating the window', async () => {
    await runStartup({ ipcMain, appInstance, settings: settingsService, pushService, logService, createWindow })

    const settingsIdx = callOrder.indexOf('settings.getSettings')
    const windowIdx = callOrder.indexOf('createWindow')

    expect(settingsIdx).toBeGreaterThanOrEqual(0)
    expect(windowIdx).toBeGreaterThanOrEqual(0)
    expect(settingsIdx).toBeLessThan(windowIdx)
  })

  it('initializes the API registry after the window is created', async () => {
    await runStartup({ ipcMain, appInstance, settings: settingsService, pushService, logService, createWindow })

    const windowIdx = callOrder.indexOf('createWindow')
    const appIdx = callOrder.indexOf('app.initialize')

    expect(windowIdx).toBeGreaterThanOrEqual(0)
    expect(appIdx).toBeGreaterThanOrEqual(0)
    expect(windowIdx).toBeLessThan(appIdx)
  })

  it('initializes PushService after the window is created', async () => {
    await runStartup({ ipcMain, appInstance, settings: settingsService, pushService, logService, createWindow })

    const windowIdx = callOrder.indexOf('createWindow')
    const pushIdx = callOrder.indexOf('pushService.initialize')

    expect(windowIdx).toBeGreaterThanOrEqual(0)
    expect(pushIdx).toBeGreaterThanOrEqual(0)
    expect(windowIdx).toBeLessThan(pushIdx)
  })

  it('initializes LogService after the window is created', async () => {
    await runStartup({ ipcMain, appInstance, settings: settingsService, pushService, logService, createWindow })

    const windowIdx = callOrder.indexOf('createWindow')
    const logIdx = callOrder.indexOf('logService.initialize')

    expect(windowIdx).toBeGreaterThanOrEqual(0)
    expect(logIdx).toBeGreaterThanOrEqual(0)
    expect(windowIdx).toBeLessThan(logIdx)
  })

  it('full ordering: settings → window → app.initialize → pushService → logService', async () => {
    await runStartup({ ipcMain, appInstance, settings: settingsService, pushService, logService, createWindow })

    expect(callOrder).toEqual([
      'settings.getSettings',
      'createWindow',
      'app.initialize',
      'pushService.initialize',
      'logService.initialize',
    ])
  })
})

// ─── return value ────────────────────────────────────────────────────────────

describe('runStartup — return value', () => {
  it('returns the BrowserWindow created by createWindow', async () => {
    const webContents = makeWebContents()
    const mainWindow = makeWindow(webContents)

    const result = await runStartup({
      ipcMain: makeIpcMain(),
      appInstance: makeAppInstance(),
      settings: makeSettings(),
      pushService: makePushService(),
      logService: makeLogService(),
      createWindow: vi.fn().mockResolvedValue(mainWindow),
    })

    expect(result).toBe(mainWindow)
  })
})

// ─── PushService receives webContents ─────────────────────────────────────

describe('runStartup — PushService', () => {
  it('calls pushService.initialize with the window webContents', async () => {
    const webContents = makeWebContents()
    const mainWindow = makeWindow(webContents)
    const pushService = makePushService()

    await runStartup({
      ipcMain: makeIpcMain(),
      appInstance: makeAppInstance(),
      settings: makeSettings(),
      pushService,
      logService: makeLogService(),
      createWindow: vi.fn().mockResolvedValue(mainWindow),
    })

    expect(pushService.initialize).toHaveBeenCalledWith(webContents)
  })
})

// ─── app.initialize receives ipcMain + window ──────────────────────────────

describe('runStartup — API registry', () => {
  it('calls appInstance.initialize with ipcMain and the created window', async () => {
    const mainWindow = makeWindow()
    const ipcMain = makeIpcMain()
    const appInstance = makeAppInstance()

    await runStartup({
      ipcMain,
      appInstance,
      settings: makeSettings(),
      pushService: makePushService(),
      logService: makeLogService(),
      createWindow: vi.fn().mockResolvedValue(mainWindow),
    })

    expect(appInstance.initialize).toHaveBeenCalledWith(ipcMain, mainWindow)
  })
})
