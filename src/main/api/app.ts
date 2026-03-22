import { SettingsService } from '../services/settings.service'
import type { AppSettings } from '../../shared/models'

export class AppApi {

  private settings: SettingsService;

  constructor(settings: SettingsService) {
    this.settings = settings;
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
