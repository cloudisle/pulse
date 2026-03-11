import type { AppSettings } from '../models/settings'

export interface IElectronAPI {
  platform: string

  app: {
    getSettings(): Promise<AppSettings>
    updateSettings(data: Partial<AppSettings>): Promise<AppSettings>
    getDataPath(): Promise<string>
  }
}
