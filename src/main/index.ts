import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Api, { listenersApi } from './api'
import { StorageService } from './services/storage'
import { SettingsService } from './services/settings.service'
import { CloudService } from './services/cloud.service'
import { PushService } from './services/push.service'
import { ListenerManagerService } from './services/listeners/listener-manager.service'
import { ListenerLifecycleFactory, ListenerFactory } from './services/listeners/factory'
import { ConverterFactory } from './services/listeners/converter'
import { FilterFactory } from './services/listeners/filter'
import { VariableReplacementService } from './services/variable-replacement.service'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.cloudisle.pulse')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  // Wire up listener services
  const storage = new StorageService()
  const settings = new SettingsService(storage)
  const cloudService = new CloudService(storage, settings)
  const pushService = new PushService(mainWindow)
  const listenerFactory = new ListenerFactory(cloudService)
  const converterFactory = new ConverterFactory()
  const filterFactory = new FilterFactory()
  const lifecycleFactory = new ListenerLifecycleFactory(
    pushService,
    listenerFactory,
    converterFactory,
    filterFactory
  )
  const variableService = new VariableReplacementService()
  const listenerManager = new ListenerManagerService(lifecycleFactory, variableService)
  listenersApi.setListenerManager(listenerManager)

  Api.initialize(ipcMain)

  let isQuitting = false
  app.on('before-quit', (event) => {
    if (isQuitting) return
    event.preventDefault()
    isQuitting = true
    listenerManager.stopAll().catch(console.error).finally(() => app.quit())
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
