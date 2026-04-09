import {StoragePaths, StorageService} from "@main/services/storage.service";
import {SettingsService} from "./settings.service";
import {OutputConfig, System} from "@shared/models";

export class SystemService {

    constructor(
        private readonly storage: StorageService,
        private readonly settings: SettingsService,
    ) {}

    async get(systemId: string): Promise<System> {
        const dataDir = await this.settings.getDataPath()
        const system = await this.storage.read<System>(StoragePaths.system(dataDir, systemId))
        if (system === null) {
            throw new Error(`System not found: ${systemId}`)
        }
        return system
    }

    async getOutput(systemId: string, outputId: string): Promise<OutputConfig> {
        const system = await this.get(systemId)
        const output = system.outputs.find((o) => o.id === outputId)
        if (!output) {
            throw new Error(`Output not found: ${outputId}`)
        }
        return output
    }

}