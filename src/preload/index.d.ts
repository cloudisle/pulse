import { ElectronAPI } from '@electron-toolkit/preload'
import type { IElectronAPI } from '@shared/types/electron'

declare global {
  interface Window {
    electron: ElectronAPI
    api: Record<string, never>
    app: IElectronAPI
  }
}
