/**
 * Integration tests: Template Quick-Send End-to-End Workflow
 *
 * These tests exercise the full template quick-send flow:
 *   create system → create schema/environment/profile → create folder hierarchy
 *   → create template → build overrides from non-omitted fields → generate
 *   → send → verify session history.
 *
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

import { StorageService, StoragePaths } from '../../../src/main/services/storage'
import { SettingsService } from '../../../src/main/services/settings.service'
import { EventGenerationService } from '../../../src/main/services/event-generation.service'
import { EventSenderService } from '../../../src/main/services/publishers/event-sender.service'
import { SessionSentValueIndexService } from '../../../src/main/services/listeners/session-sent-value-index.service'
import { SystemsApi } from '../../../src/main/api/systems'
import { SessionsApi } from '../../../src/main/api/sessions'
import { EventsApi } from '../../../src/main/api/events'
import { TemplatesApi } from '../../../src/main/api/templates'

import type { Schema } from '../../../src/shared/models/schema'
import type { Environment } from '../../../src/shared/models/environment'
import type { Profile } from '../../../src/shared/models/profile'
import type { GeneratedEvent, SendEventInput, SendEventResult } from '../../../src/shared/models/event'
import type { TemplateField } from '../../../src/shared/models/template'

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
let templatesApi: TemplatesApi

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-template-workflow-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)
  generationService = new EventGenerationService()
  sentValueIndex = new SessionSentValueIndexService(storage, settings)

  const mockPublisherFactory = {
    create: vi.fn(() => ({ publish: mockKinesisPublish }))
  }
  senderService = new EventSenderService(
    storage,
    settings,
    mockPublisherFactory as any,
    sentValueIndex
  )

  systemsApi = new SystemsApi(storage, settings)
  sessionsApi = new SessionsApi(storage, settings)
  eventsApi = new EventsApi(storage, settings, generationService, senderService)
  templatesApi = new TemplatesApi(storage, settings)

  mockKinesisPublish.mockReset()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// HAPPY PATH — full template quick-send workflow
// ─────────────────────────────────────────────────────────────────────────────

describe('Template quick-send workflow', () => {
  it('completes the full workflow: prerequisites → folder hierarchy → template → quick-send → verify', async () => {
    // ── Step 1: Create system with a Kinesis input ───────────────────────────
    const system = await systemsApi.create({
      name: 'Order Processing',
      inputs: [
        {
          id: 'input-placeholder',
          name: 'Orders Input',
          type: 'kinesis',
          config: { streamName: 'orders-in', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    expect(system.id).toBeTruthy()
    expect(system.inputs).toHaveLength(1)
    const inputId = system.inputs[0].id

    // ── Step 2: Create schema with required and optional fields ──────────────
    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-tmpl-test',
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
          generationStrategy: { type: 'constant', config: { value: 'pending' } }
        },
        {
          name: 'amount',
          required: true,
          dataType: { type: 'number' },
          generationStrategy: { type: 'range', config: { min: 1, max: 100, decimals: 2 } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // ── Step 3: Create an environment ───────────────────────────────────────
    const environment: Environment = {
      id: 'env-tmpl-test',
      systemId: system.id,
      name: 'staging',
      variables: [{ key: 'env', value: 'staging', sensitive: false }],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(
      StoragePaths.environment(tmpDir, system.id, environment.id),
      environment
    )

    // ── Step 4: Create a profile that overrides `amount` ────────────────────
    const profile: Profile = {
      id: 'profile-tmpl-test',
      systemId: system.id,
      name: 'HighValue',
      overrides: [{ elementPath: 'amount', action: 'set', value: 500 }],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.profile(tmpDir, system.id, profile.id), profile)

    // ── Step 5: Create template folder hierarchy ─────────────────────────────
    const parentFolder = await templatesApi.createFolder(system.id, 'Orders', null)
    const childFolder = await templatesApi.createFolder(system.id, 'Checkout', parentFolder.id)

    // Verify tree: one root folder with one child
    const tree = await templatesApi.list(system.id)
    expect(tree.folders).toHaveLength(1)
    expect(tree.folders[0].folder.id).toBe(parentFolder.id)
    expect(tree.folders[0].children).toHaveLength(1)
    expect(tree.folders[0].children[0].folder.id).toBe(childFolder.id)

    // ── Step 6: Create template in child folder ──────────────────────────────
    //   • orderId  → omitted: true  (required field intentionally excluded from overrides)
    //   • status   → preset: 'confirmed'  (overrides the schema's constant 'pending')
    //   • amount   → omitted: true  (profile override of 500 will be applied instead)
    const template = await templatesApi.create({
      systemId: system.id,
      folderId: childFolder.id,
      name: 'Quick Order',
      description: 'Sends a quick order event',
      schemaId: schema.id,
      inputId,
      profileIds: [profile.id],
      fields: [
        { elementPath: 'orderId', value: null, omitted: true },
        { elementPath: 'status', value: 'confirmed', omitted: false },
        { elementPath: 'amount', value: null, omitted: true }
      ]
    })

    expect(template.id).toBeTruthy()
    expect(template.schemaId).toBe(schema.id)
    expect(template.inputId).toBe(inputId)
    expect(template.profileIds).toContain(profile.id)
    expect(template.folderId).toBe(childFolder.id)

    // Verify template appears in the tree under the child folder
    const updatedTree = await templatesApi.list(system.id)
    const childNode = updatedTree.folders[0].children[0]
    expect(childNode.templates).toHaveLength(1)
    expect(childNode.templates[0].id).toBe(template.id)

    // ── Step 7: Create / select a session ────────────────────────────────────
    const session = await sessionsApi.create(system.id)
    expect(session.id).toBeTruthy()
    expect(session.systemId).toBe(system.id)

    // ── Step 8: Simulate quick-send — build overrides from non-omitted fields ─
    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    // Only 'status' is non-omitted; orderId and amount are omitted
    expect(Object.keys(overrides)).toEqual(['status'])
    expect(overrides.status).toBe('confirmed')

    // ── Step 9: Generate event using template settings ────────────────────────
    const generated: GeneratedEvent = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: template.profileIds,
      overrides
    })

    expect(generated.schemaId).toBe(schema.id)
    expect(generated.appliedProfiles).toContain(profile.id)

    // status preset value wins over schema constant
    expect(generated.payload.status).toBe('confirmed')

    // amount: no ad-hoc override → profile 'set' override applies → 500
    expect(generated.payload.amount).toBe(500)

    // orderId: omitted from overrides → generated normally by schema (UUID)
    expect(typeof generated.payload.orderId).toBe('string')
    expect(generated.payload.orderId).toBeTruthy()

    // ── Step 10: Send event to the correct destination ────────────────────────
    mockKinesisPublish.mockResolvedValueOnce({
      id: 'evt-kinesis-1',
      SequenceNumber: 'seq-001',
      ShardId: 'shard-0'
    })

    const sendInput: SendEventInput = {
      inputId: template.inputId, // correct destination from template
      sessionId: session.id,
      event: generated
    }
    const sendResult: SendEventResult = await eventsApi.send(system.id, sendInput)

    // Success feedback
    expect(sendResult.success).toBe(true)
    expect(sendResult.sessionEventId).toBeTruthy()
    expect(mockKinesisPublish).toHaveBeenCalledTimes(1)
    expect(mockKinesisPublish).toHaveBeenCalledWith(JSON.stringify(generated.payload))

    // ── Step 11: Verify session history ──────────────────────────────────────
    const history = await sessionsApi.get(system.id, session.id)
    const sentEvents = history.events.filter((e) => e.direction === 'sent')
    expect(sentEvents).toHaveLength(1)

    const sentEvt = sentEvents[0]
    expect(sentEvt.schemaId).toBe(schema.id)
    expect(sentEvt.inputId).toBe(inputId)
    expect(sentEvt.profileIds).toContain(profile.id)

    const sentPayload = JSON.parse(sentEvt.payload)
    expect(sentPayload.status).toBe('confirmed')
    expect(sentPayload.amount).toBe(500)
    expect(typeof sentPayload.orderId).toBe('string')
    expect(sentPayload.orderId).toBeTruthy()
  })

  // ── Generate Preview (no send) ────────────────────────────────────────────

  it('generate preview produces payload without sending the event', async () => {
    const system = await systemsApi.create({
      name: 'Preview System',
      inputs: [
        {
          id: 'input-placeholder',
          name: 'Preview Input',
          type: 'kinesis',
          config: { streamName: 'preview-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-preview',
      systemId: system.id,
      name: 'PreviewEvent',
      elements: [
        {
          name: 'eventId',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'preview-id' } }
        },
        {
          name: 'type',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'order' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const folder = await templatesApi.createFolder(system.id, 'Events', null)
    const template = await templatesApi.create({
      systemId: system.id,
      folderId: folder.id,
      name: 'Preview Template',
      schemaId: schema.id,
      inputId: system.inputs[0].id,
      profileIds: [],
      fields: [
        { elementPath: 'eventId', value: null, omitted: true },
        { elementPath: 'type', value: 'checkout', omitted: false }
      ]
    })

    // Build overrides (same logic as quickSend)
    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    // Generate preview — no send call
    const generated: GeneratedEvent = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: template.profileIds,
      overrides
    })

    // Payload preview is available
    const previewJson = JSON.stringify(generated.payload, null, 2)
    expect(previewJson).toBeTruthy()
    const parsed = JSON.parse(previewJson)
    expect(parsed.type).toBe('checkout')
    expect(parsed.eventId).toBe('preview-id') // generated normally

    // No send called
    expect(mockKinesisPublish).not.toHaveBeenCalled()
  })

  // ── Omitted required fields — no template creation failure ────────────────

  it('template with all required fields marked omitted is created successfully', async () => {
    const system = await systemsApi.create({
      name: 'Omit Test System',
      inputs: [
        {
          id: 'input-placeholder',
          name: 'Input',
          type: 'kinesis',
          config: { streamName: 'omit-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-omit',
      systemId: system.id,
      name: 'OmitEvent',
      elements: [
        {
          name: 'requiredA',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'a' } }
        },
        {
          name: 'requiredB',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'b' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // Creating the template should NOT throw even though both required fields are omitted
    const template = await templatesApi.create({
      systemId: system.id,
      folderId: null,
      name: 'All Omitted',
      schemaId: schema.id,
      inputId: system.inputs[0].id,
      profileIds: [],
      fields: [
        { elementPath: 'requiredA', value: null, omitted: true },
        { elementPath: 'requiredB', value: null, omitted: true }
      ]
    })

    expect(template.id).toBeTruthy()

    // When quick-send builds overrides, both are skipped (omitted)
    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    expect(Object.keys(overrides)).toHaveLength(0)

    // Generation still works — fields are generated by their schema strategies
    const generated = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: [],
      overrides
    })

    expect(generated.payload.requiredA).toBe('a')
    expect(generated.payload.requiredB).toBe('b')
  })

  // ── Folder navigation — template found by navigating to child folder ───────

  it('template is found by navigating the folder tree to the correct subfolder', async () => {
    const system = await systemsApi.create({
      name: 'Navigation System',
      inputs: [
        {
          id: 'input-placeholder',
          name: 'Nav Input',
          type: 'kinesis',
          config: { streamName: 'nav-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-nav',
      systemId: system.id,
      name: 'NavEvent',
      elements: [
        {
          name: 'id',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'nav-id' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // Create a 3-level folder hierarchy: root → category → subcategory
    const rootFolder = await templatesApi.createFolder(system.id, 'Root', null)
    const categoryFolder = await templatesApi.createFolder(system.id, 'Category', rootFolder.id)
    const subFolder = await templatesApi.createFolder(system.id, 'SubCategory', categoryFolder.id)

    // Place templates at each level
    const rootTemplate = await templatesApi.create({
      systemId: system.id,
      folderId: null,
      name: 'Root Template',
      schemaId: schema.id,
      inputId: system.inputs[0].id,
      profileIds: [],
      fields: [{ elementPath: 'id', value: 'root', omitted: false }]
    })

    const subTemplate = await templatesApi.create({
      systemId: system.id,
      folderId: subFolder.id,
      name: 'Sub Template',
      schemaId: schema.id,
      inputId: system.inputs[0].id,
      profileIds: [],
      fields: [{ elementPath: 'id', value: 'sub', omitted: false }]
    })

    // Navigate the tree to find the sub-level template
    const tree = await templatesApi.list(system.id)

    // Root-level templates
    expect(tree.templates).toHaveLength(1)
    expect(tree.templates[0].id).toBe(rootTemplate.id)

    // Navigate: root folder → category folder → sub folder
    expect(tree.folders).toHaveLength(1)
    const rootNode = tree.folders[0]
    expect(rootNode.folder.name).toBe('Root')
    expect(rootNode.templates).toHaveLength(0)

    expect(rootNode.children).toHaveLength(1)
    const categoryNode = rootNode.children[0]
    expect(categoryNode.folder.name).toBe('Category')
    expect(categoryNode.templates).toHaveLength(0)

    expect(categoryNode.children).toHaveLength(1)
    const subNode = categoryNode.children[0]
    expect(subNode.folder.name).toBe('SubCategory')
    expect(subNode.templates).toHaveLength(1)
    expect(subNode.templates[0].id).toBe(subTemplate.id)

    // Quick-send from the sub-level template works end-to-end
    const session = await sessionsApi.create(system.id)
    mockKinesisPublish.mockResolvedValueOnce({
      id: 'nav-evt-1',
      SequenceNumber: 'seq-1',
      ShardId: 'shard-0'
    })

    const overrides: Record<string, any> = {}
    for (const field of subTemplate.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }
    expect(overrides.id).toBe('sub')

    const generated = await eventsApi.generate(system.id, {
      schemaId: subTemplate.schemaId,
      profileIds: subTemplate.profileIds,
      overrides
    })
    expect(generated.payload.id).toBe('sub')

    const result = await eventsApi.send(system.id, {
      inputId: subTemplate.inputId,
      sessionId: session.id,
      event: generated
    })
    expect(result.success).toBe(true)
  })

  // ── Profile applied with preset field overrides ───────────────────────────

  it('profile overrides apply to fields not preset in the template', async () => {
    const system = await systemsApi.create({
      name: 'Profile System',
      inputs: [
        {
          id: 'input-placeholder',
          name: 'Profile Input',
          type: 'kinesis',
          config: { streamName: 'profile-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-profile',
      systemId: system.id,
      name: 'ProfileEvent',
      elements: [
        {
          name: 'category',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'default' } }
        },
        {
          name: 'priority',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'normal' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // Profile overrides 'priority' to 'high'
    const profile: Profile = {
      id: 'profile-priority',
      systemId: system.id,
      name: 'HighPriority',
      overrides: [{ elementPath: 'priority', action: 'set', value: 'high' }],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.profile(tmpDir, system.id, profile.id), profile)

    // Template only presets 'category'; 'priority' is omitted (profile applies)
    const template = await templatesApi.create({
      systemId: system.id,
      folderId: null,
      name: 'Category Template',
      schemaId: schema.id,
      inputId: system.inputs[0].id,
      profileIds: [profile.id],
      fields: [
        { elementPath: 'category', value: 'urgent', omitted: false },
        { elementPath: 'priority', value: null, omitted: true }
      ]
    })

    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    const generated = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: template.profileIds,
      overrides
    })

    // Template preset wins for 'category'
    expect(generated.payload.category).toBe('urgent')
    // Profile override applies for 'priority' (no template override)
    expect(generated.payload.priority).toBe('high')
    expect(generated.appliedProfiles).toContain(profile.id)
  })

  // ── Send failure — result carries error information ───────────────────────

  it('send failure returns success=false with error information', async () => {
    const system = await systemsApi.create({
      name: 'Failure System',
      inputs: [
        {
          id: 'input-placeholder',
          name: 'Failure Input',
          type: 'kinesis',
          config: { streamName: 'fail-stream', region: 'us-east-1' }
        }
      ],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-failure',
      systemId: system.id,
      name: 'FailEvent',
      elements: [
        {
          name: 'id',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'fail-id' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const template = await templatesApi.create({
      systemId: system.id,
      folderId: null,
      name: 'Fail Template',
      schemaId: schema.id,
      inputId: system.inputs[0].id,
      profileIds: [],
      fields: [{ elementPath: 'id', value: 'fail-id', omitted: false }]
    })

    const session = await sessionsApi.create(system.id)

    mockKinesisPublish.mockRejectedValueOnce(new Error('StreamNotFound'))

    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    const generated = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: [],
      overrides
    })

    const result = await eventsApi.send(system.id, {
      inputId: template.inputId,
      sessionId: session.id,
      event: generated
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('StreamNotFound')

    // Session history still records the failed event
    const history = await sessionsApi.get(system.id, session.id)
    const sentEvents = history.events.filter((e) => e.direction === 'sent')
    expect(sentEvents).toHaveLength(1)
    expect(sentEvents[0].status).toBe('failed')
    expect(sentEvents[0].error).toBe('StreamNotFound')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE FIELD OVERRIDE PRECEDENCE
// ─────────────────────────────────────────────────────────────────────────────

describe('Template field override precedence', () => {
  it('template preset field (ad-hoc override) takes precedence over profile set action', async () => {
    const system = await systemsApi.create({
      name: 'Precedence System',
      inputs: [],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-precedence',
      systemId: system.id,
      name: 'PrecedenceEvent',
      elements: [
        {
          name: 'value',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'schema-default' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // Profile sets 'value' to 'profile-value'
    const profile: Profile = {
      id: 'profile-precedence',
      systemId: system.id,
      name: 'PrecedenceProfile',
      overrides: [{ elementPath: 'value', action: 'set', value: 'profile-value' }],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.profile(tmpDir, system.id, profile.id), profile)

    // Template preset for 'value' is 'template-value' — this wins over profile
    const template = await templatesApi.create({
      systemId: system.id,
      folderId: null,
      name: 'Precedence Template',
      schemaId: schema.id,
      inputId: 'input-placeholder',
      profileIds: [profile.id],
      fields: [{ elementPath: 'value', value: 'template-value', omitted: false }]
    })

    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    const generated = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: template.profileIds,
      overrides
    })

    // Template value wins over profile value
    expect(generated.payload.value).toBe('template-value')
    expect(generated.appliedProfiles).toContain(profile.id)
  })

  it('profile set action applies when template omits the field', async () => {
    const system = await systemsApi.create({
      name: 'Profile Fallback System',
      inputs: [],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-profile-fallback',
      systemId: system.id,
      name: 'ProfileFallbackEvent',
      elements: [
        {
          name: 'score',
          required: true,
          dataType: { type: 'number' },
          generationStrategy: { type: 'range', config: { min: 0, max: 10 } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    const profile: Profile = {
      id: 'profile-score',
      systemId: system.id,
      name: 'HighScore',
      overrides: [{ elementPath: 'score', action: 'set', value: 99 }],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.profile(tmpDir, system.id, profile.id), profile)

    const template = await templatesApi.create({
      systemId: system.id,
      folderId: null,
      name: 'Score Template',
      schemaId: schema.id,
      inputId: 'input-placeholder',
      profileIds: [profile.id],
      // 'score' is omitted → no ad-hoc override → profile applies
      fields: [{ elementPath: 'score', value: null, omitted: true }]
    })

    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    expect(Object.keys(overrides)).toHaveLength(0)

    const generated = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: template.profileIds,
      overrides
    })

    // Profile applies because template omitted the field
    expect(generated.payload.score).toBe(99)
    expect(generated.appliedProfiles).toContain(profile.id)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// QUICK-SEND OVERRIDES — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Quick-send overrides edge cases', () => {
  it('template with no fields results in empty overrides (optional fields not auto-generated)', async () => {
    const system = await systemsApi.create({
      name: 'No Fields System',
      inputs: [],
      outputs: []
    })

    const now = new Date().toISOString()
    const schema: Schema = {
      id: 'schema-no-fields',
      systemId: system.id,
      name: 'NoFieldsEvent',
      elements: [
        {
          name: 'auto',
          required: false,
          dataType: { type: 'string' },
          generationStrategy: { type: 'constant', config: { value: 'auto-generated' } }
        }
      ],
      createdAt: now,
      updatedAt: now
    }
    await storage.write(StoragePaths.schema(tmpDir, system.id, schema.id), schema)

    // Template has no fields — nothing required in schema → valid
    const template = await templatesApi.create({
      systemId: system.id,
      folderId: null,
      name: 'Empty Fields Template',
      schemaId: schema.id,
      inputId: 'input-placeholder',
      profileIds: [],
      fields: []
    })

    const overrides: Record<string, any> = {}
    for (const field of template.fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    expect(Object.keys(overrides)).toHaveLength(0)

    const generated = await eventsApi.generate(system.id, {
      schemaId: template.schemaId,
      profileIds: [],
      overrides
    })

    // Optional field without any override is not included in the payload
    expect(generated.payload).not.toHaveProperty('auto')
  })

  it('only fields with omitted=false and a defined value appear in overrides', async () => {
    // Build a representative set of TemplateField entries
    const fields: TemplateField[] = [
      { elementPath: 'a', value: 'hello', omitted: false },   // included
      { elementPath: 'b', value: null, omitted: true },        // excluded (omitted)
      { elementPath: 'c', value: undefined, omitted: false },  // excluded (value undefined)
      { elementPath: 'd', value: 0, omitted: false },          // included (falsy but defined)
      { elementPath: 'e', value: false, omitted: false },      // included (falsy but defined)
      { elementPath: 'f', value: '', omitted: false }          // included (empty string but defined)
    ]

    const overrides: Record<string, any> = {}
    for (const field of fields) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    expect(overrides).toHaveProperty('a', 'hello')
    expect(overrides).not.toHaveProperty('b') // omitted
    expect(overrides).not.toHaveProperty('c') // value undefined
    expect(overrides).toHaveProperty('d', 0)
    expect(overrides).toHaveProperty('e', false)
    expect(overrides).toHaveProperty('f', '')
  })
})
