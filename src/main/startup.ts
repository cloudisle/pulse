import type { BrowserWindow, IpcMain } from 'electron'
import type { App } from '../app/index'
import type { AppConfig } from '../app/index'
import type { SettingsService } from './services/settings.service'
import type { PushService } from './services/push.service'
import type { LogService } from './services/log.service'

export interface StartupDependencies {
  /** Electron IpcMain instance used to register API handlers. */
  ipcMain: IpcMain
  /** The application API registry (App instance). */
  appInstance: App<AppConfig>
  /** Settings service – used to load (or create) AppSettings on first launch. */
  settings: SettingsService
  /** Service that forwards IPC pushes to the renderer via webContents. */
  pushService: PushService
  /** Service that manages application-level log lifecycle. */
  logService: LogService
  /** Factory that creates and returns the main BrowserWindow. */
  createWindow: () => Promise<BrowserWindow>
}

/**
 * Runs the application startup sequence in the correct order:
 *
 * 1. Load AppSettings (or create defaults on first launch).
 * 2. Create the BrowserWindow (contextIsolation: true, nodeIntegration: false).
 * 3. Initialize the API registry (register IPC handlers) with ipcMain + window.
 * 4. Initialize PushService with the window's webContents.
 * 5. Initialize LogService.
 *
 * @returns The created BrowserWindow.
 */
export async function runStartup(deps: StartupDependencies): Promise<BrowserWindow> {
  const { ipcMain, appInstance, settings, pushService, logService, createWindow } = deps

  // Step 1: Load AppSettings – creates defaults on first launch if none exist.
  await settings.getSettings()

  // Step 2: Create the BrowserWindow (contextIsolation: true, nodeIntegration: false,
  //         preload script loaded inside createWindow).
  const mainWindow = await createWindow()

  // Step 3: Initialize the API registry – registers all IPC handlers.
  appInstance.initialize(ipcMain, mainWindow)

  // Step 4: Initialize PushService with the window's webContents.
  pushService.initialize(mainWindow.webContents)

  // Step 5: Initialize LogService.
  logService.initialize()

  return mainWindow
}
