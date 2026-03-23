import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

const appMocks = vi.hoisted(() => ({
  logEntrySend: vi.fn(),
  listenerLifecycleSend: vi.fn(),
  listenerDataSend: vi.fn(),
  listenerErrorSend: vi.fn(),
  addSessionLog: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

vi.mock('../../../../src/app', () => ({
  default: {
    channels: {
      log: {
        entry: { send: appMocks.logEntrySend }
      },
      listeners: {
        lifecycle: { send: appMocks.listenerLifecycleSend },
        data: { send: appMocks.listenerDataSend },
        error: { send: appMocks.listenerErrorSend }
      }
    },
    api: {
      sessions: {
        addLog: appMocks.addSessionLog
      }
    }
  }
}))

import { StorageService, StoragePaths } from '../../../../src/main/services/storage'
import { SettingsService } from '../../../../src/main/services/settings.service'
import { EventGenerationService } from '../../../../src/main/services/event-generation.service'
import { EventSenderService } from '../../../../src/main/services/publishers/event-sender.service'
import { EventsApi } from '../../../../src/main/api/events'
import type { Schema, SchemaElement } from '../../../../src/shared/models/schema'
import type { Environment } from '../../../../src/shared/models/environment'
import type { Profile } from '../../../../src/shared/models/profile'
import type { System, InputConfig } from '../../../../src/shared/models/system'
import type {
  GenerateEventInput,
  GeneratedEvent,
  SendEventInput,
  SendEventResult,
  ValidationResult
} from '../../../../src/shared/models/event'

const SYSTEM_ID = 'sys-test-1'

const flatElement: SchemaElement = {
  name: 'orderId',
  required: true,
  dataType: { type: 'string' },
  generationStrategy: { type: 'faker', config: { method: 'string.uuid' } }
}

const baseSchema: Omit<Schema, 'id'> = {
  systemId: SYSTEM_ID,
  name: 'OrderEvent',
  elements: [flatElement],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
}

function makeGeneratedEvent(overrides?: Partial<GeneratedEvent>): GeneratedEvent {
  return {
    schemaId: 'schema-1',
    payload: { orderId: 'abc-123' },
    appliedProfiles: [],
    warnings: [],
    ...overrides
  }
}

function makeSendInput(overrides?: Partial<SendEventInput>): SendEventInput {
  return {
    inputId: 'input-1',
    sessionId: 'session-1',
    event: makeGeneratedEvent(),
    awsProfile: 'default',
    ...overrides
  }
}

function makeKinesisInputConfig(): InputConfig {
  return {
    id: 'input-1',
    name: 'Orders Kinesis',
    type: 'kinesis',
    config: { streamName: 'orders-stream', region: 'us-east-1' }
  }
}

function makeSystem(inputs: InputConfig[] = [makeKinesisInputConfig()]): System {
  return {
    id: SYSTEM_ID,
    name: 'Test System',
    inputs,
    outputs: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
}

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let generationService: ReturnType<typeof vi.mocked<EventGenerationService>>
let senderService: ReturnType<typeof vi.mocked<EventSenderService>>
let api: EventsApi

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-events-test-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)

  generationService = {
    generateEvent: vi.fn(),
    validateEvent: vi.fn()
  } as unknown as ReturnType<typeof vi.mocked<EventGenerationService>>

  senderService = {
    sendEvent: vi.fn()
  } as unknown as ReturnType<typeof vi.mocked<EventSenderService>>

  appMocks.logEntrySend.mockReset()
  appMocks.listenerLifecycleSend.mockReset()
  appMocks.listenerDataSend.mockReset()
  appMocks.listenerErrorSend.mockReset()
  appMocks.addSessionLog.mockReset()

  api = new EventsApi(storage, settings, generationService, senderService)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// generate — happy path
// ---------------------------------------------------------------------------

describe('EventsApi — generate (happy path)', () => {
  it('loads the schema and calls generateEvent with it', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    const expected = makeGeneratedEvent()
    vi.mocked(generationService.generateEvent).mockResolvedValueOnce(expected)

    const input: GenerateEventInput = { schemaId: schema.id }
    const result = await api.generate(SYSTEM_ID, input)

    expect(generationService.generateEvent).toHaveBeenCalledWith(
      input,
      schema,
      expect.objectContaining({ environment: undefined, profiles: [], customTypes: [] })
    )
    expect(result).toEqual(expected)
  })

  it('throws if schema is not found', async () => {
    const input: GenerateEventInput = { schemaId: 'missing-schema' }

    await expect(api.generate(SYSTEM_ID, input)).rejects.toThrow('Schema not found: missing-schema')
  })

  it('loads the environment when environmentId is provided', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    const env: Environment = {
      id: 'env-1',
      systemId: SYSTEM_ID,
      name: 'dev',
      variables: [{ key: 'region', value: 'us-east-1', sensitive: false }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
    await storage.write(StoragePaths.environment(tmpDir, SYSTEM_ID, env.id), env)

    vi.mocked(generationService.generateEvent).mockResolvedValueOnce(makeGeneratedEvent())

    const input: GenerateEventInput = { schemaId: schema.id, environmentId: env.id }
    await api.generate(SYSTEM_ID, input)

    expect(generationService.generateEvent).toHaveBeenCalledWith(
      input,
      schema,
      expect.objectContaining({ environment: env })
    )
  })

  it('passes empty environment when environmentId is not found', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    vi.mocked(generationService.generateEvent).mockResolvedValueOnce(makeGeneratedEvent())

    const input: GenerateEventInput = { schemaId: schema.id, environmentId: 'missing-env' }
    await api.generate(SYSTEM_ID, input)

    expect(generationService.generateEvent).toHaveBeenCalledWith(
      input,
      schema,
      expect.objectContaining({ environment: undefined })
    )
  })

  it('returns the GeneratedEvent produced by the generation service', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    const expected: GeneratedEvent = {
      schemaId: schema.id,
      payload: { orderId: 'XYZ-999' },
      appliedProfiles: [],
      warnings: [{ elementPath: 'orderId', message: 'below min length', severity: 'warning' }]
    }
    vi.mocked(generationService.generateEvent).mockResolvedValueOnce(expected)

    const result = await api.generate(SYSTEM_ID, { schemaId: schema.id })

    expect(result).toEqual(expected)
  })
})

// ---------------------------------------------------------------------------
// generate — with profiles
// ---------------------------------------------------------------------------

describe('EventsApi — generate (with profiles)', () => {
  it('loads profiles by id and passes them to generateEvent', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    const profile: Profile = {
      id: 'profile-1',
      systemId: SYSTEM_ID,
      name: 'VIP Profile',
      overrides: [{ elementPath: 'orderId', action: 'set', value: 'VIP-001' }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
    await storage.write(StoragePaths.profile(tmpDir, SYSTEM_ID, profile.id), profile)

    vi.mocked(generationService.generateEvent).mockResolvedValueOnce(makeGeneratedEvent())

    const input: GenerateEventInput = { schemaId: schema.id, profileIds: [profile.id] }
    await api.generate(SYSTEM_ID, input)

    expect(generationService.generateEvent).toHaveBeenCalledWith(
      input,
      schema,
      expect.objectContaining({ profiles: [profile] })
    )
  })

  it('skips profiles that are not found', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    vi.mocked(generationService.generateEvent).mockResolvedValueOnce(makeGeneratedEvent())

    const input: GenerateEventInput = {
      schemaId: schema.id,
      profileIds: ['missing-profile-1', 'missing-profile-2']
    }
    await api.generate(SYSTEM_ID, input)

    expect(generationService.generateEvent).toHaveBeenCalledWith(
      input,
      schema,
      expect.objectContaining({ profiles: [] })
    )
  })

  it('loads multiple profiles in order and passes them all', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    const profileA: Profile = {
      id: 'profile-a',
      systemId: SYSTEM_ID,
      name: 'Profile A',
      overrides: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
    const profileB: Profile = {
      id: 'profile-b',
      systemId: SYSTEM_ID,
      name: 'Profile B',
      overrides: [],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
    await storage.write(StoragePaths.profile(tmpDir, SYSTEM_ID, profileA.id), profileA)
    await storage.write(StoragePaths.profile(tmpDir, SYSTEM_ID, profileB.id), profileB)

    vi.mocked(generationService.generateEvent).mockResolvedValueOnce(makeGeneratedEvent())

    const input: GenerateEventInput = {
      schemaId: schema.id,
      profileIds: [profileA.id, profileB.id]
    }
    await api.generate(SYSTEM_ID, input)

    expect(generationService.generateEvent).toHaveBeenCalledWith(
      input,
      schema,
      expect.objectContaining({ profiles: [profileA, profileB] })
    )
  })
})

// ---------------------------------------------------------------------------
// send — success
// ---------------------------------------------------------------------------

describe('EventsApi — send (success)', () => {
  it('resolves the inputConfig from the system and calls sendEvent', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYSTEM_ID), system)

    const sendResult: SendEventResult = {
      success: true,
      sessionEventId: 'evt-1',
      metadata: { SequenceNumber: '1' }
    }
    vi.mocked(senderService.sendEvent).mockResolvedValueOnce(sendResult)

    const input = makeSendInput()
    const result = await api.send(SYSTEM_ID, input)

    expect(senderService.sendEvent).toHaveBeenCalledWith(
      SYSTEM_ID,
      input,
      makeKinesisInputConfig(),
      undefined
    )
    expect(result).toEqual(sendResult)
  })

  it('loads the environment when environmentId is provided', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYSTEM_ID), system)

    const env: Environment = {
      id: 'env-1',
      systemId: SYSTEM_ID,
      name: 'dev',
      variables: [{ key: 'region', value: 'us-east-1', sensitive: false }],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }
    await storage.write(StoragePaths.environment(tmpDir, SYSTEM_ID, env.id), env)

    vi.mocked(senderService.sendEvent).mockResolvedValueOnce({
      success: true,
      sessionEventId: 'evt-1'
    })

    const input = makeSendInput({ environmentId: env.id })
    await api.send(SYSTEM_ID, input)

    expect(senderService.sendEvent).toHaveBeenCalledWith(SYSTEM_ID, input, makeKinesisInputConfig(), env)
  })

  it('emits an info log entry with exact message on success', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYSTEM_ID), system)

    vi.mocked(senderService.sendEvent).mockResolvedValueOnce({
      success: true,
      sessionEventId: 'evt-42'
    })

    const input = makeSendInput()
    await api.send(SYSTEM_ID, input)

    expect(appMocks.logEntrySend).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'info',
        source: 'events.api',
        message: 'Event sent to Orders Kinesis',
        sessionId: input.sessionId,
        metadata: expect.objectContaining({
          sessionEventId: 'evt-42',
          inputId: input.inputId,
          schemaId: input.event.schemaId
        })
      })
    )
  })

  it('returns the result from EventSenderService', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYSTEM_ID), system)

    const sendResult: SendEventResult = {
      success: true,
      sessionEventId: 'evt-99',
      metadata: { MessageId: 'msg-99' }
    }
    vi.mocked(senderService.sendEvent).mockResolvedValueOnce(sendResult)

    const result = await api.send(SYSTEM_ID, makeSendInput())

    expect(result).toEqual(sendResult)
  })

  it('sends logs through App.channels.log.entry', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYSTEM_ID), system)

    vi.mocked(senderService.sendEvent).mockResolvedValueOnce({
      success: true,
      sessionEventId: 'evt-1'
    })

    await api.send(SYSTEM_ID, makeSendInput())

    expect(appMocks.logEntrySend).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// send — failure
// ---------------------------------------------------------------------------

describe('EventsApi — send (failure)', () => {
  it('emits an error log entry with exact message when send fails', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYSTEM_ID), system)

    vi.mocked(senderService.sendEvent).mockResolvedValueOnce({
      success: false,
      sessionEventId: 'evt-fail-1',
      error: 'ResourceNotFoundException'
    })

    const input = makeSendInput()
    const result = await api.send(SYSTEM_ID, input)

    expect(result.success).toBe(false)
    expect(result.error).toBe('ResourceNotFoundException')
    expect(appMocks.logEntrySend).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        source: 'events.api',
        message: 'Failed to send event to Orders Kinesis: ResourceNotFoundException',
        sessionId: input.sessionId
      })
    )
  })

  it('throws when system is not found', async () => {
    await expect(api.send(SYSTEM_ID, makeSendInput())).rejects.toThrow(
      `System not found: ${SYSTEM_ID}`
    )
  })

  it('throws when inputConfig is not found in the system', async () => {
    const systemWithNoInputs = makeSystem([])
    await storage.write(StoragePaths.system(tmpDir, SYSTEM_ID), systemWithNoInputs)

    await expect(api.send(SYSTEM_ID, makeSendInput({ inputId: 'missing-input' }))).rejects.toThrow(
      'Input not found: missing-input'
    )
  })
})

// ---------------------------------------------------------------------------
// validate — with warnings
// ---------------------------------------------------------------------------

describe('EventsApi — validate', () => {
  it('loads the schema and delegates validation to the generation service', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    const expected: ValidationResult = {
      valid: true,
      warnings: [
        {
          elementPath: 'orderId',
          message: 'Value does not match required pattern',
          severity: 'warning'
        }
      ]
    }
    vi.mocked(generationService.validateEvent).mockReturnValueOnce(expected)

    const generatedEvent = makeGeneratedEvent({ schemaId: schema.id })
    const result = await api.validate(SYSTEM_ID, generatedEvent, schema.id)

    expect(generationService.validateEvent).toHaveBeenCalledWith(
      generatedEvent.payload,
      schema,
      []
    )
    expect(result).toEqual(expected)
  })

  it('returns a result with warnings for constraint violations', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    const warnings = [
      { elementPath: 'orderId', message: 'Value too short', severity: 'warning' as const }
    ]
    vi.mocked(generationService.validateEvent).mockReturnValueOnce({ valid: true, warnings })

    const result = await api.validate(SYSTEM_ID, makeGeneratedEvent(), schema.id)

    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].elementPath).toBe('orderId')
  })

  it('returns valid=true with no warnings when payload satisfies all constraints', async () => {
    const schema: Schema = { ...baseSchema, id: 'schema-1' }
    await storage.write(StoragePaths.schema(tmpDir, SYSTEM_ID, schema.id), schema)

    vi.mocked(generationService.validateEvent).mockReturnValueOnce({ valid: true, warnings: [] })

    const result = await api.validate(SYSTEM_ID, makeGeneratedEvent(), schema.id)

    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('throws when schema is not found', async () => {
    await expect(
      api.validate(SYSTEM_ID, makeGeneratedEvent(), 'missing-schema')
    ).rejects.toThrow('Schema not found: missing-schema')
  })
})
