import type { Api } from '../../shared/api'
import { StorageService, StoragePaths } from '../services/storage'
import { SettingsService } from '../services/settings.service'
import { ListenerManagerService } from '../services/listeners/listener-manager.service'
import type { ListenerConfig, ListenerStartResult, ListenerStatus, System } from '../../shared/models'

export class ListenersApi implements Api {
  readonly api = 'listeners'

  private listenerManager: ListenerManagerService | null = null

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService
  ) {}

  setListenerManager(manager: ListenerManagerService): void {
    this.listenerManager = manager
  }

  async start(config: ListenerConfig): Promise<ListenerStartResult> {
    const manager = this.requireListenerManager()
    const dataDir = await this.settings.getDataPath()
    const system = await this.storage.read<System>(StoragePaths.system(dataDir, config.systemId))

    if (system === null) {
      throw new Error(`System not found: ${config.systemId}`)
    }

    const outputConfig = system.outputs.find((o) => o.id === config.outputId)
    if (!outputConfig) {
      throw new Error(`Output not found: ${config.outputId}`)
    }

    return manager.startListener(config, outputConfig)
  }

  async stop(listenerId: string): Promise<void> {
    await this.requireListenerManager().stopListener(listenerId)
  }

  async status(): Promise<ListenerStatus[]> {
    return this.requireListenerManager().getStatus()
  }

  private requireListenerManager(): ListenerManagerService {
    if (!this.listenerManager) {
      throw new Error('ListenerManagerService not initialized')
    }
    return this.listenerManager
  }
}
