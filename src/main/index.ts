import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import App from '../app'

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
}

const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1500,
  height: 1000
}

let appInitialized = false

function getWindowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

async function loadWindowState(): Promise<WindowState> {
  try {
    const content = await fs.readFile(getWindowStatePath(), 'utf-8')
    const parsed = JSON.parse(content) as Partial<WindowState>
    if (!isValidNumber(parsed.width) || !isValidNumber(parsed.height)) {
      return DEFAULT_WINDOW_STATE
    }
    const state: WindowState = { width: parsed.width, height: parsed.height }
    if (isValidNumber(parsed.x) && isValidNumber(parsed.y)) {
      state.x = parsed.x
      state.y = parsed.y
    }
    return state
  } catch {
    return DEFAULT_WINDOW_STATE
  }
}

async function saveWindowState(mainWindow: BrowserWindow): Promise<void> {
  if (mainWindow.isMinimized() || mainWindow.isMaximized() || mainWindow.isFullScreen()) {
    return
  }

  const bounds = mainWindow.getBounds()
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y
  }

  const filePath = getWindowStatePath()
  await fs.mkdir(join(filePath, '..'), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8')
}

function createWindowStateSaver(mainWindow: BrowserWindow): () => void {
  let pendingSave: NodeJS.Timeout | null = null

  return () => {
    if (pendingSave) {
      clearTimeout(pendingSave)
    }
    pendingSave = setTimeout(() => {
      void saveWindowState(mainWindow)
    }, 200)
  }
}

async function createWindow(): Promise<BrowserWindow> {
  const state = await loadWindowState()
  const mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (!appInitialized) {
    App.initialize(ipcMain, mainWindow)
    appInitialized = true
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  const persistWindowState = createWindowStateSaver(mainWindow)
  mainWindow.on('resize', persistWindowState)
  mainWindow.on('move', persistWindowState)
  mainWindow.on('close', () => {
    void saveWindowState(mainWindow)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.cloudisle.pulse')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  await createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
