import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GeneratedEvent, InputConfig, Environment, SendEventInput } from '../../../../src/shared/models'
import { StoragePaths, StorageService } from '../../../../src/main/services/storage'
import { SettingsService } from '../../../../src/main/services/settings.service'
import { EventSenderService } from '../../../../src/main/services/publishers/event-sender.service'

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
    cloud: { aws: { profile: AWS_PROFILE } },
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
  let service: EventSenderService
  let factory: { create: ReturnType<typeof vi.fn> }
  let mockKinesisPublish: ReturnType<typeof vi.fn>
  let mockSqsPublish: ReturnType<typeof vi.fn>
  let mockEventBridgePublish: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockKinesisPublish = vi.fn()
    mockSqsPublish = vi.fn()
    mockEventBridgePublish = vi.fn()

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

    factory = {
      create: vi.fn((config: InputConfig) => {
        if (config.type === 'kinesis') return { id: 'kinesis-publisher', publish: mockKinesisPublish }
        if (config.type === 'sqs') return { id: 'sqs-publisher', publish: mockSqsPublish }
        if (config.type === 'eventbridge') {
          return { id: 'eventbridge-publisher', publish: mockEventBridgePublish }
        }
        throw new Error(`Unsupported input type: ${String((config as { type?: string }).type)}`)
      })
    }

    service = new EventSenderService(storage, settings, factory as any)
  })

  describe('Kinesis', () => {
    it('creates a kinesis publisher with the resolved stream name', async () => {
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const input = makeSendEventInput()
      const inputConfig = makeKinesisInputConfig()

      const result = await service.sendEvent(SYSTEM_ID, input, inputConfig)

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'kinesis',
          config: expect.objectContaining({ streamName: 'orders-stream', region: 'us-east-1' })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
      expect(result.success).toBe(true)
      expect(result.metadata).toEqual({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
    })

    it('applies variable replacement to the stream name', async () => {
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const inputConfig = makeKinesisInputConfig({ streamName: '{{ env }}-orders-stream' })
      const environment = makeEnvironment({ env: 'dev' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig, environment)

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ streamName: 'dev-orders-stream' })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
    })

    it('serializes the event payload as JSON before publish', async () => {
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const event = makeGeneratedEvent({ payload: { orderId: 'abc', amount: 42 } })
      const input = makeSendEventInput({ event })

      await service.sendEvent(SYSTEM_ID, input, makeKinesisInputConfig())

      expect(mockKinesisPublish).toHaveBeenCalledWith(JSON.stringify({ orderId: 'abc', amount: 42 }))
    })

    it('returns success=true and sessionEventId on success', async () => {
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-42', SequenceNumber: 'seq-42', ShardId: 'shard-1' })

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeKinesisInputConfig())

      expect(result.success).toBe(true)
      expect(result.sessionEventId).toBe('evt-42')
      expect(result.error).toBeUndefined()
    })

    it('returns success=false with error message when publish fails', async () => {
      mockKinesisPublish.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeKinesisInputConfig())

      expect(result.success).toBe(false)
      expect(result.error).toBe('ResourceNotFoundException')
      expect(typeof result.sessionEventId).toBe('string')
    })
  })

  describe('SQS', () => {
    it('creates an sqs publisher with the resolved queue URL and sends JSON payload', async () => {
      mockSqsPublish.mockResolvedValueOnce({ id: 'evt-sqs-1', MessageId: 'msg-1' })
      const input = makeSendEventInput()
      const inputConfig = makeSqsInputConfig()

      const result = await service.sendEvent(SYSTEM_ID, input, inputConfig)

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sqs',
          config: expect.objectContaining({
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/my-queue',
            region: 'us-east-1'
          })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
      expect(mockSqsPublish).toHaveBeenCalledWith(JSON.stringify(input.event.payload))
      expect(result.success).toBe(true)
      expect(result.metadata).toEqual({ id: 'evt-sqs-1', MessageId: 'msg-1' })
    })

    it('applies variable replacement to the queue URL', async () => {
      mockSqsPublish.mockResolvedValueOnce({ id: 'evt-sqs-1', MessageId: 'msg-1' })
      const inputConfig = makeSqsInputConfig({ queueUrl: 'https://sqs.us-east-1.amazonaws.com/{{ accountId }}/my-queue' })
      const environment = makeEnvironment({ accountId: '999888777' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig, environment)

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/999888777/my-queue'
          })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
    })

    it('returns success=false with error message when publish fails', async () => {
      mockSqsPublish.mockRejectedValueOnce(new Error('QueueDoesNotExist'))

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeSqsInputConfig())

      expect(result.success).toBe(false)
      expect(result.error).toBe('QueueDoesNotExist')
    })
  })

  describe('EventBridge', () => {
    it('creates an eventbridge publisher with resolved config and sends JSON payload', async () => {
      mockEventBridgePublish.mockResolvedValueOnce({ id: 'evt-eb-1', EventId: 'evt-1' })
      const input = makeSendEventInput()
      const inputConfig = makeEventBridgeInputConfig()

      const result = await service.sendEvent(SYSTEM_ID, input, inputConfig)

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'eventbridge',
          config: expect.objectContaining({
            eventBusName: 'my-event-bus',
            source: 'com.myapp.orders',
            detailType: 'OrderCreated',
            region: 'us-east-1'
          })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
      expect(mockEventBridgePublish).toHaveBeenCalledWith(JSON.stringify(input.event.payload))
      expect(result.success).toBe(true)
      expect(result.metadata).toEqual({ id: 'evt-eb-1', EventId: 'evt-1' })
    })

    it('applies variable replacement to all EventBridge config fields', async () => {
      mockEventBridgePublish.mockResolvedValueOnce({ id: 'evt-eb-1', EventId: 'evt-1' })
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

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            eventBusName: 'staging-event-bus',
            source: 'myapp.orders',
            detailType: 'OrderPlaced'
          })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
    })

    it('returns success=false with error message when publish fails', async () => {
      mockEventBridgePublish.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

      const result = await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeEventBridgeInputConfig())

      expect(result.success).toBe(false)
      expect(result.error).toBe('ResourceNotFoundException')
    })
  })

  describe('Session event recording', () => {
    it('persists a SessionEvent with direction sent and status success on success', async () => {
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
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
          payload: JSON.stringify(input.event.payload),
          status: 'success'
        })
      )
    })

    it('persists a SessionEvent with status failed and error on failure', async () => {
      mockKinesisPublish.mockRejectedValueOnce(new Error('ProvisionedThroughputExceededException'))
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
      mockSqsPublish.mockResolvedValueOnce({ id: 'evt-sqs-99', MessageId: 'msg-99' })
      const input = makeSendEventInput()

      const result = await service.sendEvent(SYSTEM_ID, input, makeSqsInputConfig())

      expect(storage.write).toHaveBeenCalledWith(
        StoragePaths.sessionEvent(DATA_DIR, SYSTEM_ID, SESSION_ID, result.sessionEventId),
        expect.objectContaining({
          metadata: expect.objectContaining({ MessageId: 'msg-99' })
        })
      )
    })

    it('persists a SessionEvent even when the send fails', async () => {
      mockKinesisPublish.mockRejectedValueOnce(new Error('Timeout'))

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), makeKinesisInputConfig())

      expect(storage.write).toHaveBeenCalledTimes(1)
    })

    it('includes appliedProfiles in the SessionEvent', async () => {
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
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
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const inputConfig = makeKinesisInputConfig({ streamName: '{{ env }}-stream' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig)

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ streamName: '{{ env }}-stream' })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
    })

    it('applies variable replacement to the region field', async () => {
      mockKinesisPublish.mockResolvedValueOnce({ id: 'evt-1', SequenceNumber: 'seq-1', ShardId: 'shard-0' })
      const inputConfig = makeKinesisInputConfig({ streamName: 'orders', region: '{{ region }}' })
      const environment = makeEnvironment({ region: 'ap-southeast-2' })

      await service.sendEvent(SYSTEM_ID, makeSendEventInput(), inputConfig, environment)

      expect(factory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ region: 'ap-southeast-2' })
        }),
        { aws: { profile: AWS_PROFILE } }
      )
    })
  })
})
