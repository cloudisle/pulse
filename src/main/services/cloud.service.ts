import type { AppSettings } from '../../shared/models'
import { SettingsService } from './settings.service'
import { StoragePaths, StorageService } from './storage'
import type { LogService } from './log.service'

export enum PutMode {
  MERGE,
  REPLACE
}

type CloudPlatformSettings = Record<string, any>
type CloudSettings = Record<string, CloudPlatformSettings>
type CloudBackedAppSettings = AppSettings & {
  cloud?: CloudSettings
}

export class CloudService {
  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly logger?: LogService,
  ) {}

  async get(platform: string, key?: string): Promise<any> {
    const current = await this.readCurrentSettings()
    const platformSettings = current.cloud?.[platform]

    if (platformSettings === undefined) {
      return key === undefined ? {} : undefined
    }

    if (key === undefined) {
      return platformSettings
    }

    return platformSettings[key]
  }

  async put(platform: string, key: string, data: Record<string, any>): Promise<void> {
    const value = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : data
    await this.putAll(platform, { [key]: value }, PutMode.MERGE)
  }

  async putAll(
    platform: string,
    data: Record<string, any>,
    mode: PutMode = PutMode.MERGE
  ): Promise<void> {
    const current = await this.readCurrentSettings()

    const existingCloud = this.isRecord(current.cloud) ? current.cloud : {}
    const existingPlatform = this.isRecord(existingCloud[platform]) ? existingCloud[platform] : {}

    const nextPlatform =
      mode === PutMode.REPLACE
        ? { ...data }
        : { ...existingPlatform, ...data }

    const nextSettings: CloudBackedAppSettings = {
      ...current,
      cloud: {
        ...existingCloud,
        [platform]: nextPlatform
      }
    }

    await this.logger?.info('aws', `Updating ${platform} cloud settings`)
    await this.storage.write(StoragePaths.settings(current.dataDirectory), nextSettings)
  }

  private async readCurrentSettings(): Promise<CloudBackedAppSettings> {
    const current = await this.settings.getSettings()
    return current as CloudBackedAppSettings
  }

  private isRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}