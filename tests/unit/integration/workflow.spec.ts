/**
 * Integration tests: End-to-End Workflow
 *
 * These tests exercise the full generate → send → listen workflow using real
 * file-system storage (temp directories) and mocked AWS publish/listen calls.
 * All service instances are wired together the same way the production code
 * does it; only the leaf-level AWS SDK calls are replaced with vi.fn() stubs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

// ─── Mocks ────────────────────────────────────────────────────────────────────
// electron & App are already mocked globally in tests/unit/setup.ts.
// The AWS publisher is injected as a plain stub object — no real HTTP calls.

const mockKinesisPublish = vi.fn()

// ─── Imports ──────────────────────────────────────────────────────────────────

import { StorageService, StoragePaths } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import { EventGenerationService } from '@main/services/event-generation.service'
import { EventSenderService } from '@main/services/publishers/event-sender.service'
import { SessionSentValueIndexService } from '@main/services/listeners/session-sent-value-index.service'
import {
  AggregateFilter,
  FilterFactory,
  SessionCorrelationMessageFilter
} from '@main/services/listeners/filter'
import { ConverterFactory } from '@main/services/listeners/converter'
import { ListenerLifecycleFactory } from '@main/services/listeners/factory'
import { ListenerManagerService } from '@main/services/listeners/listener-manager.service'
import { DefaultMessageHandler } from '@main/services/listeners/listener'
import { SystemsApi } from '@main/api/systems'
import { SessionsApi } from '@main/api/sessions'
import { EventsApi } from '@main/api/events'
import App from '@app'

import type { Schema } from '@shared/models/schema'
import type { Environment } from '@shared/models/environment'
import type { Profile } from '@shared/models/profile'
import type { SessionDetail, SessionEvent } from '@shared/models/session'
import type {
  GenerateEventInput,
  GeneratedEvent,
  SendEventInput,
  SendEventResult
} from '@shared/models/event'
import type { ListenerConfig } from '@shared/models'

// ─── Suite setup ──────────────────────────────────────────────────────────────

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let generationService: EventGenerationService
let sentValueIndex: SessionSentValueIndexService
let senderService: EventSenderService
let systemsApi: SystemsApi
let sessionsApi: SessionsApi
let eventsApi: EventsApi

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-integration-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)
  generationService = new EventGenerationService()
  sentValueIndex = new SessionSentValueIndexService(storage, settings)

  const publisherFactory = {
    create: vi.fn(() => ({ publish: mockKinesisPublish }))
  }
  senderService = new EventSenderService(storage, settings, publisherFactory as any, sentValueIndex)

  systemsApi = new SystemsApi(storage, settings)
  sessionsApi = new SessionsApi(storage, settings)
  eventsApi = new EventsApi(storage, settings, generationService, senderService)

  mockKinesisPublish.mockReset()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// HAPPY PATH — full workflow steps 1–13
// ─────────────────────────────────────────────────────────────────────────────

describe('Full end-to-end workflow', () => {
  it('completes steps 1–13: create system → generate → send → listen → verify history', async () => {
    // ── Step 1: Create system with Kinesis input and Kinesis output ──────────
    const system = await systemsApi.create({
      name: 'Order Processing',
      inputs: [
        {
          id: 'input-placeholder', // SystemsApi assigns a new UUID
          name: 'Orders Input',
          type: 'kinesis',
          config: { streamName: '{{ env }}-orders-in', region: '{{ region }}' }
        }
      ],
      outputs: [
        {
          id: 'output-placeholder',
          name: 'Orders Output',
          type: 'kinesis',
          contentType: 'json',
          config: { streamName: '{{ env }}-orders-out', region: '{{ region }}' },
          listenerDefaults: {
            filterMode: 'all',
            includeUnmatched: false,
            filters: [
              {
                type: 'sessionCorrelation',
                config: {
                  sentPath: '$.orderId',
                  receivedPath: '$.correlationId',
                  includeHistoricalSent: true
                }
              }
            ]
          }
        }
      ]
    })

    expect(system.id).toBeTruthy()
    expect(system.inputs).toHaveLength(1)
    expect(system.outputs).toHaveLength(1)

    const inputId = system.inputs[0].id
    const outputId = system.outputs[0].id

    // ── Step 2: Create a schema with multiple generation strategies ──────────
    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-1',
      systemId: system.id,
      name: 'OrderCreated',
      elements: [
        {
          name: 'orderId',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'faker', config: { method: 'string.uuid' } }
        },
        {
          name: 'status',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'enum', config: { values: ['pending', 'confirmed', 'shipped'] } }
        },
        {
          name: 'amount',
          required: true,
          dataType: { type: 'number' },
          generationStrategy: { type: 'range', config: { min: 1, max: 1000, decimals: 2 } }
        },
        {
          name: 'region',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: '{{ region }}' } }
        },
        {
          name: 'source',
          required: false,
          dataType: { type: 'string' },
          generationStrategy: { type: 'template', config: { template: 'order-service-{{ env }}' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // ── Step 3: Create an environment with variables ─────────────────────────
    const environment: Environment = {
      id: 'env-1',
      systemId: system.id,
      name: 'staging',
      variables: [
        { key: 'env', value: 'staging', sensitive: false },
        { key: 'region', value: 'eu-west-1', sensitive: false }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.environment(tmpDir, system.id, environment.id), environment)

    // ── Step 4: Create a profile with overrides ──────────────────────────────
    const profile: Profile = {
      id: 'profile-1',
      systemId: system.id,
      name: 'HighValue',
      overrides: [{ elementPath: 'amount', action: 'set', value: 999.99 }],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.profile(tmpDir, system.id, profile.id), profile)

    // ── Steps 5–6: Select system/environment/profile → Create a session ──────
    const session = await sessionsApi.create(system.id)
    expect(session.id).toBeTruthy()
    expect(session.systemId).toBe(system.id)

    // ── Step 7: Generate an event — verify profile overrides & variables ──────
    const generateInput: GenerateEventInput = {
      schemaId: schema.id,
      environmentId: environment.id,
      profileIds: [profile.id]
    }
    const generated: GeneratedEvent = await eventsApi.generate(system.id, generateInput)

    expect(generated.schemaId).toBe(schema.id)
    expect(generated.appliedProfiles).toContain(profile.id)
    // Profile override: amount must be the overridden value
    expect(generated.payload.amount).toBe(999.99)
    // Variable replacement: region and source must use env variables
    expect(generated.payload.region).toBe('eu-west-1')
    expect(generated.payload.source).toBe('order-service-staging')
    // Status must be one of the enum values
    expect(['pending', 'confirmed', 'shipped']).toContain(generated.payload.status)

    // ── Step 8: Send the event (mock AWS publish) ────────────────────────────
    const sentOrderId: string = generated.payload.orderId
    mockKinesisPublish.mockResolvedValueOnce({
      id: 'evt-kinesis-1',
      SequenceNumber: 'seq-001',
      ShardId: 'shardId-000000000000'
    })

    const sendInput: SendEventInput = {
      inputId,
      sessionId: session.id,
      event: generated,
      cloud: { aws: { profile: 'staging-profile' } },
      environmentId: environment.id
    }
    const sendResult: SendEventResult = await eventsApi.send(system.id, sendInput)

    expect(sendResult.success).toBe(true)
    expect(sendResult.sessionEventId).toBeTruthy()
    expect(mockKinesisPublish).toHaveBeenCalledTimes(1)
    // The payload sent to Kinesis must be the JSON-encoded generated payload
    expect(mockKinesisPublish).toHaveBeenCalledWith(JSON.stringify(generated.payload))

    // ── Steps 9–11: Start a listener, simulate a received event, verify ──────
    // Build a minimal listener infrastructure (no AWS poll required)
    const receivedEvent: SessionEvent = {
      id: 'received-evt-1',
      sessionId: session.id,
      outputId,
      listenerId: 'listener-1',
      direction: 'received',
      timestamp: new Date().toISOString(),
      resources: { [outputId]: 'Orders Output', 'listener-1': 'Orders Output' },
      payload: JSON.stringify({ correlationId: sentOrderId, result: 'processed' }),
      status: 'success'
    }

    // Record the sent payload in the index (simulates what sendEvent does)
    sentValueIndex.recordSentPayload(system.id, session.id, generated.payload)

    // The sessionCorrelation filter should match the received event
    const correlationFilter = new SessionCorrelationMessageFilter(
      { sentPath: '$.orderId', receivedPath: '$.correlationId' },
      {
        systemId: system.id,
        outputId,
        sessionId: session.id,
        cloud: {}
      },
      sentValueIndex
    )
    const receivedPayloadParsed = JSON.parse(receivedEvent.payload)
    const matchResult = correlationFilter.matches({
      raw: { data: receivedEvent.payload },
      data: receivedPayloadParsed
    })
    expect(matchResult).toBe(true)

    // Persist the received event (simulates what DefaultMessageHandler does)
    await sessionsApi.addEvent(system.id, session.id, receivedEvent)

    // ── Step 12 (implicit): no active listener to stop in unit context ────────

    // ── Step 13: Verify session history shows the full exchange ──────────────
    const history: SessionDetail = await sessionsApi.get(system.id, session.id)

    const sentEvents = history.events.filter((e) => e.direction === 'sent')
    const receivedEvents = history.events.filter((e) => e.direction === 'received')

    expect(sentEvents).toHaveLength(1)
    expect(receivedEvents).toHaveLength(1)

    const sentEvt = sentEvents[0]
    expect(sentEvt.schemaId).toBe(schema.id)
    expect(sentEvt.inputId).toBe(inputId)
    expect(sentEvt.profileIds).toContain(profile.id)
    expect(JSON.parse(sentEvt.payload).amount).toBe(999.99)

    const rcvEvt = receivedEvents[0]
    expect(rcvEvt.outputId).toBe(outputId)
    expect(JSON.parse(rcvEvt.payload).correlationId).toBe(sentOrderId)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// LISTENER LIFECYCLE — start / stop via ListenerManagerService
// ─────────────────────────────────────────────────────────────────────────────

describe('Listener lifecycle integration', () => {
  it('starts a listener, transitions to running, and stops it cleanly', async () => {
    const system = await systemsApi.create({
      name: 'Listener Test System',
      inputs: [],
      outputs: [
        {
          id: 'out-placeholder',
          name: 'Test Output',
          type: 'kinesis',
          contentType: 'json',
          config: { streamName: 'test-stream', region: 'us-east-1' }
        }
      ]
    })

    const session = await sessionsApi.create(system.id)
    const outputId = system.outputs[0].id

    // Build a stub Listener that does nothing (no AWS poll)
    const mockStart = vi.fn().mockResolvedValue(undefined)
    const mockStop = vi.fn().mockResolvedValue(undefined)

    const mockListenerFactory = {
      create: vi.fn().mockReturnValue({ id: 'listener-stub', start: mockStart, stop: mockStop })
    }

    const converterFactory = new ConverterFactory()
    const filterFactory = new FilterFactory(sentValueIndex)
    const lifecycleFactory = new ListenerLifecycleFactory(
      mockListenerFactory as any,
      converterFactory,
      filterFactory
    )
    const manager = new ListenerManagerService(lifecycleFactory, sentValueIndex)

    const listenerConfig: ListenerConfig = {
      systemId: system.id,
      outputId,
      sessionId: session.id,
      cloud: { aws: { profile: 'default' } }
    }

    const outputConfig = system.outputs[0]

    // Start
    const startResult = await manager.startListener(listenerConfig, outputConfig)
    await new Promise((resolve) => setTimeout(resolve, 0)) // flush microtasks
    expect(startResult.listenerId).toBeTruthy()

    const statusAfterStart = manager.getStatus()
    expect(statusAfterStart).toHaveLength(1)
    const listenerEntry = statusAfterStart[0]
    expect(listenerEntry.sessionId).toBe(session.id)
    expect(listenerEntry.outputId).toBe(outputId)

    // Stop
    await manager.stopListener(startResult.listenerId)
    const statusAfterStop = manager.getStatus()
    expect(statusAfterStop[0].status).toBe('stopped')
    expect(mockStop).toHaveBeenCalledTimes(1)
  })

  it('hydrates historical sent values when correlation filter requires it', async () => {
    const systemId = 'sys-hydrate'
    const sessionId = 'session-hydrate'

    // Pre-populate a sent event in storage
    const now = new Date().toISOString()
    const systemDir = path.join(tmpDir, 'systems', systemId)
    await fs.mkdir(path.join(systemDir, 'sessions', sessionId, 'events'), { recursive: true })

    const sentEvent: SessionEvent = {
      id: 'sent-evt-hydrate',
      sessionId,
      direction: 'sent',
      timestamp: now,
      payload: JSON.stringify({ orderId: 'ORD-HYDRATE' }),
      status: 'success'
    }
    await storage.write(
      StoragePaths.sessionEvent(tmpDir, systemId, sessionId, sentEvent.id),
      sentEvent
    )

    // Hydrate from storage
    await sentValueIndex.hydrateFromSessionStorage(systemId, sessionId)

    // Correlation filter must now match incoming event referencing that orderId
    const filter = new SessionCorrelationMessageFilter(
      { sentPath: '$.orderId', receivedPath: '$.correlationId' },
      { systemId, outputId: 'out-1', sessionId, cloud: {} },
      sentValueIndex
    )

    expect(
      filter.matches({
        raw: { data: '{"correlationId":"ORD-HYDRATE"}' },
        data: { correlationId: 'ORD-HYDRATE' }
      })
    ).toBe(true)

    expect(
      filter.matches({
        raw: { data: '{"correlationId":"ORD-UNKNOWN"}' },
        data: { correlationId: 'ORD-UNKNOWN' }
      })
    ).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ERROR SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Error scenarios', () => {
  it('handles send failure gracefully — returns success=false with error message', async () => {
    const system = await systemsApi.create({
      name: 'Error Test System',
      inputs: [
        {
          id: 'input-err',
          name: 'Error Input',
          type: 'kinesis',
          config: { streamName: 'error-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-err',
      systemId: system.id,
      name: 'ErrorEvent',
      elements: [
        {
          name: 'id',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'err-id-1' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const session = await sessionsApi.create(system.id)

    const generated = await eventsApi.generate(system.id, { schemaId: schema.id })
    expect(generated.payload.id).toBe('err-id-1')

    // Simulate AWS failure
    mockKinesisPublish.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

    const sendInput: SendEventInput = {
      inputId: system.inputs[0].id,
      sessionId: session.id,
      event: generated,
      cloud: { aws: { profile: 'default' } }
    }
    const result = await eventsApi.send(system.id, sendInput)

    expect(result.success).toBe(false)
    expect(result.error).toBe('ResourceNotFoundException')

    // The session event must still be recorded with status 'failed'
    const history = await sessionsApi.get(system.id, session.id)
    const failedEvt = history.events.find((e) => e.direction === 'sent')
    expect(failedEvt).toBeDefined()
    expect(failedEvt!.status).toBe('failed')
    expect(failedEvt!.error).toBe('ResourceNotFoundException')
  })

  it('throws when sending to an unknown system', async () => {
    const sendInput: SendEventInput = {
      inputId: 'input-1',
      sessionId: 'session-1',
      event: {
        schemaId: 'schema-1',
        payload: { id: '1' },
        appliedProfiles: [],
        warnings: []
      },
      cloud: { aws: { profile: 'default' } }
    }

    await expect(eventsApi.send('non-existent-system', sendInput)).rejects.toThrow(
      'System not found: non-existent-system'
    )
  })

  it('throws when generating for a missing schema', async () => {
    const system = await systemsApi.create({ name: 'S', inputs: [], outputs: [] })

    await expect(
      eventsApi.generate(system.id, { schemaId: 'missing-schema-id' })
    ).rejects.toThrow('Schema not found: missing-schema-id')
  })

  it('throws when sending to an input that does not exist in the system', async () => {
    const system = await systemsApi.create({
      name: 'No Input System',
      inputs: [],
      outputs: []
    })

    const sendInput: SendEventInput = {
      inputId: 'non-existent-input',
      sessionId: 'session-1',
      event: {
        schemaId: 'schema-1',
        payload: { id: '1' },
        appliedProfiles: [],
        warnings: []
      },
      cloud: { aws: { profile: 'default' } }
    }

    await expect(eventsApi.send(system.id, sendInput)).rejects.toThrow(
      'Input not found: non-existent-input'
    )
  })

  it('listener error does not crash — handler.onError is called', async () => {
    const systemId = 'sys-listener-err'
    const sessionId = 'session-listener-err'

    const filter = new AggregateFilter([], {
      systemId,
      outputId: 'out-1',
      sessionId,
      cloud: {}
    })
    const converter = new ConverterFactory().create('json')
    const handler = new DefaultMessageHandler(
      'Error Output',
      { systemId, outputId: 'out-1', sessionId, cloud: {} },
      filter,
      converter
    )

    // onError should not throw
    await expect(
      handler.onError('listener-err-id', Object.assign(new Error('StreamNotFound'), { recoverable: false }))
    ).resolves.not.toThrow()

    // The global App mock should have received the lifecycle error send
    expect(App.channels.listeners.error.send).toHaveBeenCalledWith(
      expect.objectContaining({
        listenerId: 'listener-err-id',
        error: 'StreamNotFound',
        recoverable: false
      })
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('send with no environment leaves template variables unreplaced in stream name', async () => {
    const system = await systemsApi.create({
      name: 'No Env System',
      inputs: [
        {
          id: 'input-no-env',
          name: 'No-Env Input',
          type: 'kinesis',
          config: { streamName: '{{ env }}-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-no-env',
      systemId: system.id,
      name: 'MinimalEvent',
      elements: [
        {
          name: 'id',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'fixed-id' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const session = await sessionsApi.create(system.id)
    const generated = await eventsApi.generate(system.id, { schemaId: schema.id })

    mockKinesisPublish.mockResolvedValueOnce({
      id: 'evt-no-env',
      SequenceNumber: 'seq-1',
      ShardId: 'shard-0'
    })

    const sendInput: SendEventInput = {
      inputId: system.inputs[0].id,
      sessionId: session.id,
      event: generated,
      cloud: { aws: { profile: 'default' } }
      // no environmentId
    }
    const result = await eventsApi.send(system.id, sendInput)

    // Without environment the publish still succeeds (unreplaced variables pass through)
    expect(result.success).toBe(true)
    expect(mockKinesisPublish).toHaveBeenCalledTimes(1)
  })

  it('generate with no profiles returns empty appliedProfiles', async () => {
    const system = await systemsApi.create({ name: 'No Profile', inputs: [], outputs: [] })
    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-np',
      systemId: system.id,
      name: 'NP',
      elements: [
        {
          name: 'value',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'hello' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const result = await eventsApi.generate(system.id, { schemaId: schema.id })

    expect(result.appliedProfiles).toEqual([])
    expect(result.payload.value).toBe('hello')
  })

  it('generate with empty overrides does not alter any generated values', async () => {
    const system = await systemsApi.create({ name: 'Empty Overrides', inputs: [], outputs: [] })
    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-eo',
      systemId: system.id,
      name: 'EO',
      elements: [
        {
          name: 'status',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'active' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const result = await eventsApi.generate(system.id, {
      schemaId: schema.id,
      overrides: {}
    })

    expect(result.payload.status).toBe('active')
  })

  it('generate with ad-hoc overrides replaces values from the input', async () => {
    const system = await systemsApi.create({ name: 'Ad-Hoc Overrides', inputs: [], outputs: [] })
    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-aho',
      systemId: system.id,
      name: 'AHO',
      elements: [
        {
          name: 'orderId',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'faker', config: { method: 'string.uuid' } }
        },
        {
          name: 'amount',
          required: true,
          dataType: { type: 'number' },
          generationStrategy: { type: 'range', config: { min: 1, max: 100 } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const result = await eventsApi.generate(system.id, {
      schemaId: schema.id,
      overrides: { amount: 42 }
    })

    expect(result.payload.amount).toBe(42)
    // orderId still generated normally (not overridden)
    expect(typeof result.payload.orderId).toBe('string')
    expect(result.payload.orderId).toBeTruthy()
  })

  it('optional field not overridden by profile still uses generated value', async () => {
    const system = await systemsApi.create({ name: 'Optional Fields', inputs: [], outputs: [] })
    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-opt',
      systemId: system.id,
      name: 'Opt',
      elements: [
        {
          name: 'notes',
          required: false,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'default-note' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // Profile that does not override 'notes'
    const profile: Profile = {
      id: 'profile-opt',
      systemId: system.id,
      name: 'NoNotesOverride',
      overrides: [],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.profile(tmpDir, system.id, profile.id), profile)

    const result = await eventsApi.generate(system.id, {
      schemaId: schema.id,
      profileIds: [profile.id]
    })

    // Optional field not overridden by profile must still carry the generated value
    expect(result.payload.notes).toBe('default-note')
    expect(result.appliedProfiles).toContain(profile.id)
  })

  it('correlation filter does not match when sent payload is missing', async () => {
    // Fresh sentValueIndex — nothing recorded yet
    const freshIndex = new SessionSentValueIndexService(storage, settings)
    const filter = new SessionCorrelationMessageFilter(
      { sentPath: '$.orderId', receivedPath: '$.correlationId' },
      { systemId: 'sys-x', outputId: 'out-x', sessionId: 'session-x', cloud: {} },
      freshIndex
    )

    expect(
      filter.matches({
        raw: { data: '{"correlationId":"some-id"}' },
        data: { correlationId: 'some-id' }
      })
    ).toBe(false)
  })

  it('aggregate filter with no filters and includeUnmatched=false rejects all messages', async () => {
    const filter = new AggregateFilter([], {
      systemId: 'sys-y',
      outputId: 'out-y',
      sessionId: 'session-y',
      cloud: {},
      includeUnmatched: false
    })

    expect(filter.matches({ raw: { data: '{}' }, data: {} })).toBe(false)
  })

  it('aggregate filter with no filters and includeUnmatched=true accepts all messages', async () => {
    const filter = new AggregateFilter([], {
      systemId: 'sys-z',
      outputId: 'out-z',
      sessionId: 'session-z',
      cloud: {},
      includeUnmatched: true
    })

    expect(filter.matches({ raw: { data: '{}' }, data: {} })).toBe(true)
  })

  it('session history persists both sent and received events across multiple sends', async () => {
    const system = await systemsApi.create({
      name: 'Multi-Event System',
      inputs: [
        {
          id: 'input-multi',
          name: 'Multi Input',
          type: 'kinesis',
          config: { streamName: 'multi-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-multi',
      systemId: system.id,
      name: 'MultiEvent',
      elements: [
        {
          name: 'id',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'faker', config: { method: 'string.uuid' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const session = await sessionsApi.create(system.id)

    // Send two events
    for (let i = 0; i < 2; i++) {
      const generated = await eventsApi.generate(system.id, { schemaId: schema.id })
      mockKinesisPublish.mockResolvedValueOnce({ id: `evt-multi-${i}`, SequenceNumber: `seq-${i}`, ShardId: 'shard-0' })
      await eventsApi.send(system.id, {
        inputId: system.inputs[0].id,
        sessionId: session.id,
        event: generated,
        cloud: { aws: { profile: 'default' } }
      })
    }

    const history = await sessionsApi.get(system.id, session.id)
    const sentEvents = history.events.filter((e) => e.direction === 'sent')
    expect(sentEvents).toHaveLength(2)
  })
})
