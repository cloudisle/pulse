import path from 'path'
import { app } from 'electron'
import { StorageService, StoragePaths } from '@main/services/storage.service'
import type { AppSettings } from '@shared/models/settings'
import {lazy} from "@main/util";

const DEFAULT_SETTINGS: Omit<AppSettings, 'dataDirectory'> = {
  sessionHistoryLimit: 10,
  defaultRegion: 'us-east-1',
  theme: 'dark',
  logLevel: 'info'
}

export class SettingsService {

  // @ts-ignore - this value is set lazily
  private readonly dataDir: string

  constructor(
    private readonly storage: StorageService,
    dataDir?: string
  ) {
    lazy(this, "dataDir", () => dataDir ?? path.join(app.getPath('userData'), 'data'))
  }

  async getDataPath(): Promise<string> {
    return this.dataDir
  }

  async getSettings(): Promise<AppSettings> {
    const filePath = StoragePaths.settings(this.dataDir)
    const existing = await this.storage.read<AppSettings>(filePath)
    if (existing !== null) {
      return existing
    }
    const defaults: AppSettings = {
      ...DEFAULT_SETTINGS,
      dataDirectory: this.dataDir
    }
    await this.storage.write(filePath, defaults)
    return defaults
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings()
    const updated: AppSettings = { ...current, ...partial }
    await this.storage.write(StoragePaths.settings(this.dataDir), updated)
    return updated
  }
}
