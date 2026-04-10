import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import { ListenerManagerService } from '@main/services/listeners/listener-manager.service'
import type { ListenerConfig, ListenerStartResult, ListenerStatus, System } from '@shared/models'
import type { Environment } from '@shared/models'
import {app} from "electron";

let quitting = false;

export class ListenersApi {

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly manager: ListenerManagerService,
  ) {}

  initialize(): void {
    app.on('before-quit', (event) => {
      if (quitting) {
        return;
      }

      event.preventDefault();
      quitting = true;

      this.manager.stopAll()
          .catch(console.error)
          .finally(() => app.quit())
    });
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

    let environment: Environment | undefined
    if (config.environmentId) {
      const env = await this.storage.read<Environment>(
        StoragePaths.environment(dataDir, config.systemId, config.environmentId)
      )
      if (env !== null) environment = env
    }

    return manager.startListener(config, outputConfig, environment)
  }

  async stop(listenerId: string): Promise<void> {
    await this.requireListenerManager().stopListener(listenerId)
  }

  async status(): Promise<ListenerStatus[]> {
    return this.requireListenerManager().getStatus()
  }

  private requireListenerManager(): ListenerManagerService {
    if (!this.manager) {
      throw new Error('ListenerManagerService not initialized')
    }
    return this.manager
  }
}
