import { randomUUID } from 'crypto'
import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import { VariableReplacementService } from '@main/services/variable-replacement.service'
import type { InputConfig, KinesisConfig, SqsConfig, EventBridgeConfig } from '@shared/models'
import type { Environment } from '@shared/models'
import type { Schema, Profile } from '@shared/models'
import type { SessionEvent } from '@shared/models'
import type { SendEventInput, SendEventResult } from '@shared/models'
import { PublisherFactory } from "@main/services/publishers/factory";
import { PublishResult } from "@main/services/publishers/publisher";
import {logger} from "@main/util/log";
import { SessionSentValueIndexService } from '@main/services/listeners/session-sent-value-index.service';

const log = logger('event-sender.service');

export class EventSenderService {

  private readonly variables: VariableReplacementService;

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly factory: PublisherFactory,
    private readonly sentValueIndex: SessionSentValueIndexService,
  ) {
    this.variables = new VariableReplacementService();
  }

  async sendEvent(
    systemId: string,
    input: SendEventInput,
    inputConfig: InputConfig,
    environment?: Environment
  ): Promise<SendEventResult> {
    // 1. Resolve input config: apply variable replacement using environment variables
    const variables = this.buildVariables(environment)
    const resolvedConfig = this.variables.replaceVariablesInObject(
      inputConfig.config,
      variables
    ) as KinesisConfig | SqsConfig | EventBridgeConfig

    const logContext = { systemId, sessionId: input.sessionId }
    console.log(resolvedConfig, variables, environment);
    await log.info(`Sending event to ${this.describeTarget(inputConfig.type, resolvedConfig)}`, {
      ...logContext,
      ...input,
    });

    const timestamp = new Date().toISOString()

    let eventId: string = randomUUID()
    let metadata: Record<string, any> | undefined
    let error: string | undefined
    let status: 'success' | 'failed' = 'success'

    try {
      // 2 & 3. Initialize AWS client and send the event
      const result = await this.dispatchEvent(input, inputConfig, resolvedConfig);
      eventId = result.id;
      metadata = result;
      await log.info('Event sent successfully', logContext)
    } catch (err: unknown) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
      await log.error(`Failed to send event: ${error}`, logContext)
    }

    const dataDir = await this.settings.getDataPath()
    const resourceMap = await this.resolveResourceMap(dataDir, systemId, input, inputConfig, environment)

    // 4. Record the session event
    const sessionEvent: SessionEvent = {
      id: eventId,
      sessionId: input.sessionId,
      direction: 'sent',
      timestamp,
      inputId: input.inputId,
      environmentId: input.environmentId,
      schemaId: input.event.schemaId,
      profileIds: input.event.appliedProfiles,
      resources: resourceMap,
      payload: JSON.stringify(input.event.payload),
      ...(metadata !== undefined && { metadata }),
      status,
      ...(error !== undefined && { error })
    }

    await this.storage.write(
      StoragePaths.sessionEvent(dataDir, systemId, input.sessionId, eventId),
      sessionEvent
    )

    if (status === 'success') {
      this.sentValueIndex.recordSentPayload(systemId, input.sessionId, input.event.payload)
    }

    // 5. Return SendEventResult
    return {
      success: status === 'success',
      sessionEventId: eventId,
      ...(metadata !== undefined && { metadata }),
      ...(error !== undefined && { error })
    }
  }

  private async dispatchEvent(
    input: SendEventInput,
    inputConfig: InputConfig,
    resolvedConfig: KinesisConfig | SqsConfig | EventBridgeConfig
  ): Promise<PublishResult> {
    const payload = JSON.stringify(input.event.payload)

    const publisher = this.factory.create({
      ...inputConfig,
      config: resolvedConfig,
    }, input.cloud);

    return await publisher.publish(payload);
  }

  private buildVariables(environment?: Environment): Record<string, string> {
    if (environment === undefined) return {}
    return Object.fromEntries(environment.variables.map((v) => [v.key, v.value]))
  }

  private async resolveResourceMap(
    dataDir: string,
    systemId: string,
    input: SendEventInput,
    inputConfig: InputConfig,
    environment?: Environment
  ): Promise<Record<string, string>> {
    const resourceMap: Record<string, string> = {
      [input.inputId]: inputConfig.name,
    }

    if (input.environmentId) {
      resourceMap[input.environmentId] = environment?.name ?? input.environmentId
    }

    const schema = await this.storage.read<Schema>(
      StoragePaths.schema(dataDir, systemId, input.event.schemaId)
    )
    resourceMap[input.event.schemaId] = schema?.name ?? input.event.schemaId

    for (const profileId of input.event.appliedProfiles ?? []) {
      const profile = await this.storage.read<Profile>(
        StoragePaths.profile(dataDir, systemId, profileId)
      )
      resourceMap[profileId] = profile?.name ?? profileId
    }

    return resourceMap
  }

  private describeTarget(type: string, config: KinesisConfig | SqsConfig | EventBridgeConfig): string {
    if (type === 'kinesis') return `Kinesis stream ${(config as KinesisConfig).streamName}`
    if (type === 'sqs') return `SQS queue ${(config as SqsConfig).queueUrl}`
    if (type === 'eventbridge') return `EventBridge bus ${(config as EventBridgeConfig).eventBusName}`
    return type
  }
}
