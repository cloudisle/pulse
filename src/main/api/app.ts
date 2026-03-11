import type { Api } from '../../shared/api'
import { SettingsService } from '../services/settings.service'
import { StorageService } from '../services/storage'
import type { AppSettings } from '../../shared/models'

export class AppApi implements Api {
  readonly api: string = 'app'

  private settings: SettingsService;

  constructor(storage: StorageService) {
    this.settings = new SettingsService(storage);
  }

  async getSettings(): Promise<AppSettings> {
    return this.settings.getSettings()
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return this.settings.updateSettings(partial)
  }

  async getDataPath(): Promise<string> {
    return this.settings.getDataPath()
  }
}
