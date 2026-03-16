import { randomUUID } from 'crypto'
import path from 'path'
import type { Api } from '../../shared/api'
import { StorageService, StoragePaths } from '../services/storage'
import { SettingsService } from '../services/settings.service'
import { EventGenerationService } from '../services/event-generation.service'
import { EventSenderService } from '../services/publishers/event-sender.service'
import { PushService } from '../services/push.service'
import type { Schema, CustomDataType } from '../../shared/models/schema'
import type { Environment } from '../../shared/models/environment'
import type { Profile } from '../../shared/models/profile'
import type { System } from '../../shared/models/system'
import type {
  GenerateEventInput,
  GeneratedEvent,
  SendEventInput,
  SendEventResult,
  ValidationResult
} from '../../shared/models/event'

export class EventsApi implements Api {
  readonly api = 'events'

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly generationService: EventGenerationService,
    private readonly senderService: EventSenderService,
    private pushService: PushService | null = null
  ) {}

  setPushService(ps: PushService): void {
    this.pushService = ps
  }

  async generate(systemId: string, input: GenerateEventInput): Promise<GeneratedEvent> {
    const dataDir = await this.settings.getDataPath()

    const schema = await this.storage.read<Schema>(
      StoragePaths.schema(dataDir, systemId, input.schemaId)
    )
    if (schema === null) {
      throw new Error(`Schema not found: ${input.schemaId}`)
    }

    let environment: Environment | undefined
    if (input.environmentId) {
      const env = await this.storage.read<Environment>(
        StoragePaths.environment(dataDir, systemId, input.environmentId)
      )
      if (env !== null) environment = env
    }

    const profiles: Profile[] = []
    for (const profileId of input.profileIds ?? []) {
      const profile = await this.storage.read<Profile>(
        StoragePaths.profile(dataDir, systemId, profileId)
      )
      if (profile !== null) profiles.push(profile)
    }

    const customTypes = await this.loadCustomTypes(dataDir, systemId)

    return this.generationService.generateEvent(input, schema, {
      environment,
      profiles,
      customTypes
    })
  }

  async send(systemId: string, input: SendEventInput): Promise<SendEventResult> {
    const dataDir = await this.settings.getDataPath()

    const system = await this.storage.read<System>(StoragePaths.system(dataDir, systemId))
    if (system === null) {
      throw new Error(`System not found: ${systemId}`)
    }

    const inputConfig = system.inputs.find((c) => c.id === input.inputId)
    if (!inputConfig) {
      throw new Error(`Input not found: ${input.inputId}`)
    }

    let environment: Environment | undefined
    if (input.environmentId) {
      const env = await this.storage.read<Environment>(
        StoragePaths.environment(dataDir, systemId, input.environmentId)
      )
      if (env !== null) environment = env
    }

    const result = await this.senderService.sendEvent(systemId, input, inputConfig, environment)

    if (this.pushService !== null) {
      this.pushService.sendLogEntry({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        level: result.success ? 'info' : 'error',
        source: 'events',
        message: result.success
          ? `Event sent to ${inputConfig.name}`
          : `Failed to send event to ${inputConfig.name}: ${result.error ?? 'Unknown error'}`,
        sessionId: input.sessionId,
        metadata: {
          sessionEventId: result.sessionEventId,
          inputId: input.inputId,
          schemaId: input.event.schemaId
        }
      })
    }

    return result
  }

  async validate(
    systemId: string,
    generatedEvent: GeneratedEvent,
    schemaId: string
  ): Promise<ValidationResult> {
    const dataDir = await this.settings.getDataPath()

    const schema = await this.storage.read<Schema>(StoragePaths.schema(dataDir, systemId, schemaId))
    if (schema === null) {
      throw new Error(`Schema not found: ${schemaId}`)
    }

    const customTypes = await this.loadCustomTypes(dataDir, systemId)

    return this.generationService.validateEvent(generatedEvent.payload, schema, customTypes)
  }

  private async loadCustomTypes(dataDir: string, systemId: string): Promise<CustomDataType[]> {
    const customTypesDir = path.join(dataDir, 'systems', systemId, 'custom-types')
    const customTypes: CustomDataType[] = []
    try {
      const files = await this.storage.listDir(customTypesDir)
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const id = file.slice(0, -5)
        const ct = await this.storage.read<CustomDataType>(
          StoragePaths.customType(dataDir, systemId, id)
        )
        if (ct !== null) customTypes.push(ct)
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return customTypes
  }
}
