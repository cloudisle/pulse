import { randomUUID } from 'crypto'
import { PutRecordCommand } from '@aws-sdk/client-kinesis'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { PutEventsCommand } from '@aws-sdk/client-eventbridge'
import { StorageService, StoragePaths } from './storage'
import { SettingsService } from './settings.service'
import { VariableReplacementService } from './variable-replacement.service'
import { AwsClientFactory } from './aws-client.factory'
import type { InputConfig, KinesisConfig, SqsConfig, EventBridgeConfig } from '../../shared/models'
import type { Environment } from '../../shared/models'
import type { SessionEvent } from '../../shared/models'
import type { SendEventInput, SendEventResult } from '../../shared/models'

export class EventSenderService {
  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService,
    private readonly variableReplacement: VariableReplacementService,
    private readonly awsClientFactory: AwsClientFactory
  ) {}

  async sendEvent(
    systemId: string,
    input: SendEventInput,
    inputConfig: InputConfig,
    environment?: Environment
  ): Promise<SendEventResult> {
    // 1. Resolve input config: apply variable replacement using environment variables
    const variables = this.buildVariables(environment)
    const resolvedConfig = this.variableReplacement.replaceVariablesInObject(
      inputConfig.config,
      variables
    ) as KinesisConfig | SqsConfig | EventBridgeConfig

    const eventId = randomUUID()
    const timestamp = new Date().toISOString()

    let metadata: Record<string, any> | undefined
    let error: string | undefined
    let status: 'success' | 'failed' = 'success'

    try {
      // 2 & 3. Initialize AWS client and send the event
      metadata = await this.dispatchEvent(input, inputConfig, resolvedConfig)
    } catch (err: unknown) {
      status = 'failed'
      error = err instanceof Error ? err.message : String(err)
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
      payload: input.event.payload,
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
  ): Promise<Record<string, any>> {
    const payload = JSON.stringify(input.event.payload)

    if (inputConfig.type === 'kinesis') {
      const kinesisConfig = resolvedConfig as KinesisConfig
      const client = this.awsClientFactory.createKinesisClient(
        input.awsProfile,
        kinesisConfig.region
      )
      const result = await client.send(
        new PutRecordCommand({
          StreamName: kinesisConfig.streamName,
          Data: Buffer.from(payload),
          PartitionKey: randomUUID()
        })
      )
      return {
        SequenceNumber: result.SequenceNumber,
        ShardId: result.ShardId
      }
    }

    if (inputConfig.type === 'sqs') {
      const sqsConfig = resolvedConfig as SqsConfig
      const client = this.awsClientFactory.createSqsClient(input.awsProfile, sqsConfig.region)
      const result = await client.send(
        new SendMessageCommand({
          QueueUrl: sqsConfig.queueUrl,
          MessageBody: payload
        })
      )
      return {
        MessageId: result.MessageId
      }
    }

    if (inputConfig.type === 'eventbridge') {
      const ebConfig = resolvedConfig as EventBridgeConfig
      const client = this.awsClientFactory.createEventBridgeClient(
        input.awsProfile,
        ebConfig.region
      )
      const result = await client.send(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: ebConfig.eventBusName,
              Source: ebConfig.source,
              DetailType: ebConfig.detailType,
              Detail: payload
            }
          ]
        })
      )
      const entry = result.Entries?.[0]
      return {
        EventId: entry?.EventId
      }
    }

    throw new Error(`Unsupported input type: ${(inputConfig as InputConfig).type}`)
  }

  private buildVariables(environment?: Environment): Record<string, string> {
    if (environment === undefined) return {}
    return Object.fromEntries(environment.variables.map((v) => [v.key, v.value]))
  }
}
