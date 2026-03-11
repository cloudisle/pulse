import type { IpcMainInvokeEvent } from 'electron'
import type { Api } from '../../shared/api'
import { SettingsService } from '../services/settings.service'
import { StorageService } from '../services/storage'
import type { AppSettings } from '../../shared/models/settings'

export class AppApi implements Api {
  readonly api: string = 'app'

  private _settingsService: SettingsService | null

  constructor(settingsService?: SettingsService) {
    this._settingsService = settingsService ?? null
  }

  private get service(): SettingsService {
    if (!this._settingsService) {
      this._settingsService = new SettingsService(new StorageService())
    }
    return this._settingsService
  }

  async getSettings(_event: IpcMainInvokeEvent): Promise<AppSettings> {
    return this.service.getSettings()
  }

  async updateSettings(
    _event: IpcMainInvokeEvent,
    partial: Partial<AppSettings>
  ): Promise<AppSettings> {
    return this.service.updateSettings(partial)
  }

  async getDataPath(_event: IpcMainInvokeEvent): Promise<string> {
    return this.service.getDataPath()
  }
}
