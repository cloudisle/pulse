import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventSenderService } from '../../../src/main/services/event-sender.service'
import { StorageService, StoragePaths } from '../../../src/main/services/storage'
import { SettingsService } from '../../../src/main/services/settings.service'
import { VariableReplacementService } from '../../../src/main/services/variable-replacement.service'
import { AwsClientFactory } from '../../../src/main/services/aws-client.factory'
import type { InputConfig, Environment } from '../../../src/shared/models'
import type { SendEventInput, GeneratedEvent } from '../../../src/shared/models'
import {
  PutRecordCommand,
  KinesisClient
} from '@aws-sdk/client-kinesis'
import {
  SendMessageCommand,
  SQSClient
} from '@aws-sdk/client-sqs'
import {
  PutEventsCommand,
  EventBridgeClient
} from '@aws-sdk/client-eventbridge'

vi.mock('@aws-sdk/credential-providers', () => ({
  fromIni: vi.fn().mockReturnValue({})
}))

const DATA_DIR = '/test/data'
const SYSTEM_ID = 'system-1'
const SESSION_ID = 'session-1'
const SCHEMA_ID = 'schema-1'
const AWS_PROFILE = 'default'

function makeGeneratedEvent(overrides?: Partial<GeneratedEvent>): GeneratedEvent {
  return {
    schemaId: SCHEMA_ID,
    payload: { orderId: '123', amount: 99.99 },
    appliedProfiles: ['profile-1'],
    warnings: [],
    ...overrides
  }
}

function makeSendEventInput(overrides?: Partial<SendEventInput>): SendEventInput {
  return {
    inputId: 'input-1',
    sessionId: SESSION_ID,
    event: makeGeneratedEvent(),
    awsProfile: AWS_PROFILE,
    ...overrides
  }
}

function makeKinesisInputConfig(configOverrides?: object): InputConfig {
  return {
    id: 'input-1',
    name: 'My Kinesis',
    type: 'kinesis',
    config: {
      streamName: 'orders-stream',
      region: 'us-east-1',
      ...configOverrides
    }
  }
}

function makeSqsInputConfig(configOverrides?: object): InputConfig {
  return {
    id: 'input-1',
    name: 'My SQS',
    type: 'sqs',
    config: {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/my-queue',
      region: 'us-east-1',
      ...configOverrides
    }
  }
}

function makeEventBridgeInputConfig(configOverrides?: object): InputConfig {
  return {
    id: 'input-1',
    name: 'My EventBridge',
    type: 'eventbridge',
    config: {
      eventBusName: 'my-event-bus',
      region: 'us-east-1',
      source: 'com.myapp.orders',
      detailType: 'OrderCreated',
      ...configOverrides
    }
  }
}

function makeEnvironment(variables: Record<string, string> = {}): Environment {
  return {
    id: 'env-1',
    systemId: SYSTEM_ID,
    name: 'dev',
    variables: Object.entries(variables).map(([key, value]) => ({ key, value, sensitive: false })),
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
}

describe('EventSenderService', () => {
  let storage: StorageService
  let settings: SettingsService
  let variableReplacement: VariableReplacementService
  let awsClientFactory: AwsClientFactory
  let service: EventSenderService
  let mockKinesisSend: ReturnType<typeof vi.fn>
  let mockSqsSend: ReturnType<typeof vi.fn>
  let mockEventBridgeSend: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockKinesisSend = vi.fn()
    mockSqsSend = vi.fn()
    mockEventBridgeSend = vi.fn()

    storage = {
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      listDir: vi.fn(),
      ensureDir: vi.fn()
    } as unknown as StorageService

    settings = {
      getDataPath: vi.fn().mockResolvedValue(DATA_DIR)
    } as unknown as SettingsService

    variableReplacement = new VariableReplacementService()

    awsClientFactory = {
      createKinesisClient: vi.fn().mockReturnValue({ send: mockKinesisSend } as unknown as KinesisClient),
      createSqsClient: vi.fn().mockReturnValue({ send: mockSqsSend } as unknown as SQSClient),
      createEventBridgeClient: vi.fn().mockReturnValue({ send: mockEventBridgeSend } as unknown as EventBridgeClient)
    } as unknown as AwsClientFactory

    service = new EventSenderService(storage, settings, variableReplacement, awsClientFactory)
  })

  describe('Kinesis', () => {
    it('calls PutRecord with the resolved stream name and a partition key', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const input = makeSendEventInput()
      const inputConfig = makeKinesisInputConfig()

      const result = await service.sendEvent(SYSTEM_ID, input, inputConfig)

      expect(awsClientFactory.createKinesisClient).toHaveBeenCalledWith(AWS_PROFILE, 'us-east-1')
      const callArg = mockKinesisSend.mock.calls[0][0]
      expect(callArg).toBeInstanceOf(PutRecordCommand)
      expect(callArg.input.StreamName).toBe('orders-stream')
      expect(callArg.input.Data).toBeInstanceOf(Buffer)
      expect(callArg.input.PartitionKey).toBeDefined()
      expect(typeof callArg.input.PartitionKey).toBe('string')
      expect(result.success).toBe(true)
      expect(result.metadata).toEqual({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
    })

    it('applies variable replacement to the stream name', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const inputConfig = makeKinesisInputConfig({ streamName: '{{ env }}-orders-stream' })
      const environment = makeEnvironment({ env: 'dev' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig, environment)

      const callArg = mockKinesisSend.mock.calls[0][0]
      expect(callArg.input.StreamName).toBe('dev-orders-stream')
    })

    it('serializes the event payload as JSON in the Data field', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const event = makeGeneratedEvent({ payload: { orderId: 'abc', amount: 42 } })
      const input = makeSendEventInput({ event })

      await service.sendEvent(SYSTEM_ID, input, makeKinesisInputConfig())

      const callArg = mockKinesisSend.mock.calls[0][0]
      expect(callArg.input.Data.toString()).toBe(JSON.stringify({ orderId: 'abc', amount: 42 }))
    })

    it('returns success=true and sessionEventId on success', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-42', ShardId: 'shard-1' })

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeKinesisInputConfig())

      expect(result.success).toBe(true)
      expect(typeof result.sessionEventId).toBe('string')
      expect(result.error).toBeUndefined()
    })

    it('returns success=false with error message when PutRecord fails', async () => {
      mockKinesisSend.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeKinesisInputConfig())

      expect(result.success).toBe(false)
      expect(result.error).toBe('ResourceNotFoundException')
      expect(typeof result.sessionEventId).toBe('string')
    })
  })

  describe('SQS', () => {
    it('calls SendMessage with the resolved queue URL and JSON-serialized body', async () => {
      mockSqsSend.mockResolvedValueOnce({ MessageId: 'msg-1' })
      const input = makeSendEventInput()
      const inputConfig = makeSqsInputConfig()

      const result = await service.sendEvent(SYSTEM_ID, input, inputConfig)

      expect(awsClientFactory.createSqsClient).toHaveBeenCalledWith(AWS_PROFILE, 'us-east-1')
      const callArg = mockSqsSend.mock.calls[0][0]
      expect(callArg).toBeInstanceOf(SendMessageCommand)
      expect(callArg.input.QueueUrl).toBe('https://sqs.us-east-1.amazonaws.com/123456789/my-queue')
      expect(callArg.input.MessageBody).toBe(JSON.stringify(input.event.payload))
      expect(result.success).toBe(true)
      expect(result.metadata).toEqual({ MessageId: 'msg-1' })
    })

    it('applies variable replacement to the queue URL', async () => {
      mockSqsSend.mockResolvedValueOnce({ MessageId: 'msg-1' })
      const inputConfig = makeSqsInputConfig({ queueUrl: 'https://sqs.us-east-1.amazonaws.com/{{ accountId }}/my-queue' })
      const environment = makeEnvironment({ accountId: '999888777' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig, environment)

      const callArg = mockSqsSend.mock.calls[0][0]
      expect(callArg.input.QueueUrl).toBe('https://sqs.us-east-1.amazonaws.com/999888777/my-queue')
    })

    it('returns success=false with error message when SendMessage fails', async () => {
      mockSqsSend.mockRejectedValueOnce(new Error('QueueDoesNotExist'))

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeSqsInputConfig())

      expect(result.success).toBe(false)
      expect(result.error).toBe('QueueDoesNotExist')
    })
  })

  describe('EventBridge', () => {
    it('calls PutEvents with resolved bus name, source, detail type, and JSON detail', async () => {
      mockEventBridgeSend.mockResolvedValueOnce({
        Entries: [{ EventId: 'evt-1' }]
      })
      const input = makeSendEventInput()
      const inputConfig = makeEventBridgeInputConfig()

      const result = await service.sendEvent(SYSTEM_ID, input, inputConfig)

      expect(awsClientFactory.createEventBridgeClient).toHaveBeenCalledWith(AWS_PROFILE, 'us-east-1')
      const callArg = mockEventBridgeSend.mock.calls[0][0]
      expect(callArg).toBeInstanceOf(PutEventsCommand)
      const entry = callArg.input.Entries[0]
      expect(entry.EventBusName).toBe('my-event-bus')
      expect(entry.Source).toBe('com.myapp.orders')
      expect(entry.DetailType).toBe('OrderCreated')
      expect(entry.Detail).toBe(JSON.stringify(input.event.payload))
      expect(result.success).toBe(true)
      expect(result.metadata).toEqual({ EventId: 'evt-1' })
    })

    it('applies variable replacement to all EventBridge config fields', async () => {
      mockEventBridgeSend.mockResolvedValueOnce({ Entries: [{ EventId: 'evt-1' }] })
      const inputConfig = makeEventBridgeInputConfig({
        eventBusName: '{{ env }}-event-bus',
        source: '{{ appName }}.orders',
        detailType: '{{ eventType }}'
      })
      const environment = makeEnvironment({
        env: 'staging',
        appName: 'myapp',
        eventType: 'OrderPlaced'
      })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig, environment)

      const callArg = mockEventBridgeSend.mock.calls[0][0]
      const entry = callArg.input.Entries[0]
      expect(entry.EventBusName).toBe('staging-event-bus')
      expect(entry.Source).toBe('myapp.orders')
      expect(entry.DetailType).toBe('OrderPlaced')
    })

    it('returns success=false with error message when PutEvents fails', async () => {
      mockEventBridgeSend.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeEventBridgeInputConfig())

      expect(result.success).toBe(false)
      expect(result.error).toBe('ResourceNotFoundException')
    })
  })

  describe('Session event recording', () => {
    it('persists a SessionEvent with direction sent and status success on success', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const input = makeSendEventInput()

      const result = await service.sendEvent(SYSTEM_ID, input, makeKinesisInputConfig())

      expect(storage.write).toHaveBeenCalledWith(
        StoragePaths.sessionEvent(DATA_DIR, SYSTEM_ID, SESSION_ID, result.sessionEventId),
        expect.objectContaining({
          id: result.sessionEventId,
          sessionId: SESSION_ID,
          direction: 'sent',
          inputId: input.inputId,
          schemaId: SCHEMA_ID,
          payload: input.event.payload,
          status: 'success'
        })
      )
    })

    it('persists a SessionEvent with status failed and error on failure', async () => {
      mockKinesisSend.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))
      const input = makeSendEventInput()

      const result = await service.sendEvent(SYSTEM_ID, input, makeKinesisInputConfig())

      expect(storage.write).toHaveBeenCalledWith(
        StoragePaths.sessionEvent(DATA_DIR, SYSTEM_ID, SESSION_ID, result.sessionEventId),
        expect.objectContaining({
          status: 'failed',
          error: 'ProvisionedThroughputExceededException'
        })
      )
    })

    it('includes cloud metadata in the SessionEvent on success', async () => {
      mockSqsSend.mockResolvedValueOnce({ MessageId: 'msg-99' })
      const input = makeSendEventInput()

      const result = await service.sendEvent(SYSTEM_ID, input, makeSqsInputConfig())

      expect(storage.write).toHaveBeenCalledWith(
        StoragePaths.sessionEvent(DATA_DIR, SYSTEM_ID, SESSION_ID, result.sessionEventId),
        expect.objectContaining({
          metadata: { MessageId: 'msg-99' }
        })
      )
    })

    it('persists a SessionEvent even when the send fails', async () => {
      mockKinesisSend.mockRejectedValueOnce(new Error('Timeout'))

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeKinesisInputConfig())

      expect(storage.write).toHaveBeenCalledTimes(1)
    })

    it('includes appliedProfiles in the SessionEvent', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const event = makeGeneratedEvent({ appliedProfiles: ['profile-A', 'profile-B'] })
      const input = makeSendEventInput({ event })

      const result = await service.sendEvent(SYSTEM_ID, input, makeKinesisInputConfig())

      expect(storage.write).toHaveBeenCalledWith(
        StoragePaths.sessionEvent(DATA_DIR, SYSTEM_ID, SESSION_ID, result.sessionEventId),
        expect.objectContaining({ profileIds: ['profile-A', 'profile-B'] })
      )
    })
  })

  describe('Variable replacement', () => {
    it('does not apply variable replacement when no environment is provided', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const inputConfig = makeKinesisInputConfig({ streamName: '{{ env }}-stream' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig)

      const callArg = mockKinesisSend.mock.calls[0][0]
      expect(callArg.input.StreamName).toBe('{{ env }}-stream')
    })

    it('applies variable replacement to the region field', async () => {
      mockKinesisSend.mockResolvedValueOnce({ SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const inputConfig = makeKinesisInputConfig({ streamName: 'orders', region: '{{ region }}' })
      const environment = makeEnvironment({ region: 'ap-southeast-2' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig, environment)

      expect(awsClientFactory.createKinesisClient).toHaveBeenCalledWith(AWS_PROFILE, 'ap-southeast-2')
    })
  })
})
