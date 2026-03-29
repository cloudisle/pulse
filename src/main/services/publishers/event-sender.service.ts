import { randomUUID } from 'crypto'
import { StorageService, StoragePaths } from '../storage'
import { SettingsService } from '../settings.service'
import { VariableReplacementService } from '../variable-replacement.service'
import type { InputConfig, KinesisConfig, SqsConfig, EventBridgeConfig } from '../../../shared/models'
import type { Environment } from '../../../shared/models'
import type { SessionEvent } from '../../../shared/models'
import type { SendEventInput, SendEventResult } from '../../../shared/models'
import { PublisherFactory } from "./factory";
import { PublishResult } from "./publisher";
import {logger} from "../../util/log";

const log = logger('event-sender.service');

export class EventSenderService {

  private readonly variables: VariableReplacementService;

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly factory: PublisherFactory,
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

    // 4. Record the session event
    const sessionEvent: SessionEvent = {
      id: eventId,
      sessionId: input.sessionId,
      direction: 'sent',
      timestamp,
      inputId: input.inputId,
      schemaId: input.event.schemaId,
      profileIds: input.event.appliedProfiles,
      payload: JSON.stringify(input.event.payload),
      ...(metadata !== undefined && { metadata }),
      status,
      ...(error !== undefined && { error })
    }

    const dataDir = await this.settings.getDataPath()
    await this.storage.write(
      StoragePaths.sessionEvent(dataDir, systemId, input.sessionId, eventId),
      sessionEvent
    )

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
    });

    return await publisher.publish(payload);
  }

  private buildVariables(environment?: Environment): Record<string, string> {
    if (environment === undefined) return {}
    return Object.fromEntries(environment.variables.map((v) => [v.key, v.value]))
  }

  private describeTarget(type: string, config: KinesisConfig | SqsConfig | EventBridgeConfig): string {
    if (type === 'kinesis') return `Kinesis stream ${(config as KinesisConfig).streamName}`
    if (type === 'sqs') return `SQS queue ${(config as SqsConfig).queueUrl}`
    if (type === 'eventbridge') return `EventBridge bus ${(config as EventBridgeConfig).eventBusName}`
    return type
  }
}
