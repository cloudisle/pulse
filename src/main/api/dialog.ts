import { dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

export interface OpenDialogOptions {
  title?: string
  filters?: { name: string; extensions: string[] }[]
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
}

export interface SaveDialogResult {
  canceled: boolean
  filePath: string | undefined
}

export interface OpenDialogResult {
  canceled: boolean
  filePaths: string[]
}

export class DialogApi {
  private window: BrowserWindow | null = null

  setBrowserWindow(window: BrowserWindow): void {
    this.window = window
  }

  async showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogResult> {
    if (!this.window) throw new Error('BrowserWindow not set')
    const result = await dialog.showSaveDialog(this.window, options)
    return { canceled: result.canceled, filePath: result.filePath }
  }

  async showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogResult> {
    if (!this.window) throw new Error('BrowserWindow not set')
    const result = await dialog.showOpenDialog(this.window, {
      ...options,
      properties: options.properties ?? ['openFile']
    })
    return { canceled: result.canceled, filePaths: result.filePaths }
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async readTextFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
  }
}
