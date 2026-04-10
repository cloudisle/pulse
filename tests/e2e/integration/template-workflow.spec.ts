/**
 * E2E Integration tests: Template Quick-Send End-to-End Workflow
 *
 * These tests exercise the full template quick-send flow by launching the real
 * Electron application and driving it through its IPC API.
 * AWS calls are made against MiniStack (a local AWS emulator) started by the
 * Playwright global setup.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { type KinesisClient } from '@aws-sdk/client-kinesis'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { makeKinesisClient, createStream, launchApp } from './helpers'

let userDataDir: string
let electronApp: ElectronApplication
let page: Page
let kinesis: KinesisClient

test.beforeAll(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-e2e-template-'))
  kinesis = makeKinesisClient()
  ;({ app: electronApp, page } = await launchApp(userDataDir))
})

test.afterAll(async () => {
  await electronApp.close()
  kinesis.destroy()
  await fs.rm(userDataDir, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// HAPPY PATH — full template quick-send workflow
// ─────────────────────────────────────────────────────────────────────────────

test('template quick-send: create prerequisites → folder hierarchy → template → send → verify history', async () => {
  const streamName = 'e2e-tmpl-orders-in'
  await createStream(kinesis, streamName)

  // Step 1: Create system with a Kinesis input
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Template Order Processing',
    inputs: [
      {
        name: 'Orders Input',
        type: 'kinesis',
        config: { streamName, region: 'us-east-1' },
      },
    ],
    outputs: [],
  })

  expect(system.id).toBeTruthy()
  const inputId: string = system.inputs[0].id

  // Step 2: Create schema with required and optional fields
  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'OrderCreated',
    elements: [
      {
        name: 'orderId',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'faker', config: { method: 'string.uuid' } },
      },
      {
        name: 'status',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'pending' } },
      },
      {
        name: 'amount',
        required: true,
        dataType: { type: 'number' },
        generationStrategy: { type: 'range', config: { min: 1, max: 100, decimals: 2 } },
      },
    ],
  })

  // Step 3: Create an environment
  const environment = await page.evaluate(async (input) => {
    return (window as any).app.api.environments.create(input)
  }, {
    systemId: system.id,
    name: 'staging',
    variables: [{ key: 'env', value: 'staging', sensitive: false }],
  })

  expect(environment.id).toBeTruthy()

  // Step 4: Create a profile that overrides `amount`
  const profile = await page.evaluate(async (input) => {
    return (window as any).app.api.profiles.create(input)
  }, {
    systemId: system.id,
    name: 'HighValue',
    overrides: [{ elementPath: 'amount', action: 'set', value: 500 }],
  })

  // Step 5: Create template folder hierarchy
  const parentFolder = await page.evaluate(async (args) => {
    return (window as any).app.api.templates.createFolder(args.systemId, args.name, null)
  }, { systemId: system.id, name: 'Orders' })

  const childFolder = await page.evaluate(async (args) => {
    return (window as any).app.api.templates.createFolder(args.systemId, args.name, args.parentId)
  }, { systemId: system.id, name: 'Checkout', parentId: parentFolder.id })

  // Verify tree
  const tree = await page.evaluate(async (systemId) => {
    return (window as any).app.api.templates.list(systemId)
  }, system.id)

  expect(tree.folders).toHaveLength(1)
  expect(tree.folders[0].folder.id).toBe(parentFolder.id)
  expect(tree.folders[0].children).toHaveLength(1)
  expect(tree.folders[0].children[0].folder.id).toBe(childFolder.id)

  // Step 6: Create template in child folder
  //   • orderId → omitted: true
  //   • status  → preset: 'confirmed' (wins over schema constant 'pending')
  //   • amount  → omitted: true (profile override of 500 will apply)
  const template = await page.evaluate(async (input) => {
    return (window as any).app.api.templates.create(input)
  }, {
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
      { elementPath: 'amount', value: null, omitted: true },
    ],
  })

  expect(template.id).toBeTruthy()
  expect(template.folderId).toBe(childFolder.id)

  // Verify template appears in the tree
  const updatedTree = await page.evaluate(async (systemId) => {
    return (window as any).app.api.templates.list(systemId)
  }, system.id)

  const childNode = updatedTree.folders[0].children[0]
  expect(childNode.templates).toHaveLength(1)
  expect(childNode.templates[0].id).toBe(template.id)

  // Step 7: Create a session
  const session = await page.evaluate(async (systemId) => {
    return (window as any).app.api.sessions.create(systemId)
  }, system.id)

  // Step 8: Build overrides from non-omitted template fields
  const overrides: Record<string, any> = {}
  for (const field of template.fields) {
    if (!field.omitted && field.value !== undefined) {
      overrides[field.elementPath] = field.value
    }
  }

  expect(Object.keys(overrides)).toEqual(['status'])
  expect(overrides.status).toBe('confirmed')

  // Step 9: Generate event using template settings
  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      profileIds: args.profileIds,
      overrides: args.overrides,
    })
  }, { systemId: system.id, schemaId: template.schemaId, profileIds: template.profileIds, overrides })

  // status preset wins over schema constant
  expect(generated.payload.status).toBe('confirmed')
  // amount: profile override applies (no ad-hoc override)
  expect(generated.payload.amount).toBe(500)
  // orderId: generated normally
  expect(typeof generated.payload.orderId).toBe('string')
  expect(generated.payload.orderId).toBeTruthy()

  // Step 10: Send event to MiniStack Kinesis
  const sendResult = await page.evaluate(async (args) => {
    return (window as any).app.api.events.send(args.systemId, {
      inputId: args.inputId,
      sessionId: args.sessionId,
      event: args.generated,
      cloud: { aws: { profile: 'staging-profile' } },
    })
  }, { systemId: system.id, inputId: template.inputId, sessionId: session.id, generated })

  expect(sendResult.success).toBe(true)
  expect(sendResult.sessionEventId).toBeTruthy()

  // Step 11: Verify session history
  const history = await page.evaluate(async (args) => {
    return (window as any).app.api.sessions.get(args.systemId, args.sessionId)
  }, { systemId: system.id, sessionId: session.id })

  const sentEvents = history.events.filter((e: any) => e.direction === 'sent')
  expect(sentEvents).toHaveLength(1)

  const sentPayload = JSON.parse(sentEvents[0].payload)
  expect(sentPayload.status).toBe('confirmed')
  expect(sentPayload.amount).toBe(500)
  expect(typeof sentPayload.orderId).toBe('string')
})

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE PREVIEW
// ─────────────────────────────────────────────────────────────────────────────

test('generate preview produces payload without sending the event', async () => {
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Preview System',
    inputs: [
      {
        name: 'Preview Input',
        type: 'kinesis',
        config: { streamName: 'preview-stream', region: 'us-east-1' },
      },
    ],
    outputs: [],
  })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'PreviewEvent',
    elements: [
      {
        name: 'eventId',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'preview-id' } },
      },
      {
        name: 'type',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'order' } },
      },
    ],
  })

  const template = await page.evaluate(async (input) => {
    return (window as any).app.api.templates.create(input)
  }, {
    systemId: system.id,
    folderId: null,
    name: 'Preview Template',
    schemaId: schema.id,
    inputId: system.inputs[0].id,
    profileIds: [],
    fields: [
      { elementPath: 'eventId', value: null, omitted: true },
      { elementPath: 'type', value: 'preview', omitted: false },
    ],
  })

  const overrides: Record<string, any> = {}
  for (const field of template.fields) {
    if (!field.omitted && field.value !== undefined) {
      overrides[field.elementPath] = field.value
    }
  }

  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      profileIds: [],
      overrides: args.overrides,
    })
  }, { systemId: system.id, schemaId: template.schemaId, overrides })

  expect(generated.payload.eventId).toBe('preview-id')
  expect(generated.payload.type).toBe('preview')
  // No session created — just a generate preview with no send
})

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE FIELD OVERRIDE PRECEDENCE
// ─────────────────────────────────────────────────────────────────────────────

test('template preset field takes precedence over profile set action', async () => {
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, { name: 'E2E Precedence System', inputs: [], outputs: [] })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'PrecedenceEvent',
    elements: [
      {
        name: 'value',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'schema-default' } },
      },
    ],
  })

  const profile = await page.evaluate(async (input) => {
    return (window as any).app.api.profiles.create(input)
  }, {
    systemId: system.id,
    name: 'PrecedenceProfile',
    overrides: [{ elementPath: 'value', action: 'set', value: 'profile-value' }],
  })

  const template = await page.evaluate(async (input) => {
    return (window as any).app.api.templates.create(input)
  }, {
    systemId: system.id,
    folderId: null,
    name: 'Precedence Template',
    schemaId: schema.id,
    inputId: 'input-placeholder',
    profileIds: [profile.id],
    // Template preset wins over profile
    fields: [{ elementPath: 'value', value: 'template-value', omitted: false }],
  })

  const overrides: Record<string, any> = {}
  for (const field of template.fields) {
    if (!field.omitted && field.value !== undefined) {
      overrides[field.elementPath] = field.value
    }
  }

  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      profileIds: args.profileIds,
      overrides: args.overrides,
    })
  }, { systemId: system.id, schemaId: template.schemaId, profileIds: template.profileIds, overrides })

  expect(generated.payload.value).toBe('template-value')
  expect(generated.appliedProfiles).toContain(profile.id)
})

test('profile set action applies when template omits the field', async () => {
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, { name: 'E2E Profile Fallback System', inputs: [], outputs: [] })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'ProfileFallbackEvent',
    elements: [
      {
        name: 'score',
        required: true,
        dataType: { type: 'number' },
        generationStrategy: { type: 'range', config: { min: 0, max: 10 } },
      },
    ],
  })

  const profile = await page.evaluate(async (input) => {
    return (window as any).app.api.profiles.create(input)
  }, {
    systemId: system.id,
    name: 'HighScore',
    overrides: [{ elementPath: 'score', action: 'set', value: 99 }],
  })

  const template = await page.evaluate(async (input) => {
    return (window as any).app.api.templates.create(input)
  }, {
    systemId: system.id,
    folderId: null,
    name: 'Score Template',
    schemaId: schema.id,
    inputId: 'input-placeholder',
    profileIds: [profile.id],
    // score is omitted → profile applies
    fields: [{ elementPath: 'score', value: null, omitted: true }],
  })

  const overrides: Record<string, any> = {}
  for (const field of template.fields) {
    if (!field.omitted && field.value !== undefined) {
      overrides[field.elementPath] = field.value
    }
  }

  expect(Object.keys(overrides)).toHaveLength(0)

  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      profileIds: args.profileIds,
      overrides: args.overrides,
    })
  }, { systemId: system.id, schemaId: template.schemaId, profileIds: template.profileIds, overrides })

  expect(generated.payload.score).toBe(99)
  expect(generated.appliedProfiles).toContain(profile.id)
})

// ─────────────────────────────────────────────────────────────────────────────
// QUICK-SEND OVERRIDES — edge cases
// ─────────────────────────────────────────────────────────────────────────────

test('template with no fields results in empty overrides (optional fields are not auto-generated)', async () => {
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, { name: 'E2E No Fields System', inputs: [], outputs: [] })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'NoFieldsEvent',
    elements: [
      {
        name: 'auto',
        required: false,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'auto-generated' } },
      },
    ],
  })

  const template = await page.evaluate(async (input) => {
    return (window as any).app.api.templates.create(input)
  }, {
    systemId: system.id,
    folderId: null,
    name: 'Empty Fields Template',
    schemaId: schema.id,
    inputId: 'input-placeholder',
    profileIds: [],
    fields: [],
  })

  const overrides: Record<string, any> = {}
  for (const field of template.fields) {
    if (!field.omitted && field.value !== undefined) {
      overrides[field.elementPath] = field.value
    }
  }

  expect(Object.keys(overrides)).toHaveLength(0)

  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      profileIds: [],
      overrides: args.overrides,
    })
  }, { systemId: system.id, schemaId: template.schemaId, overrides })

  expect(generated.payload).not.toHaveProperty('auto')
})

test('only non-omitted fields with defined values appear in overrides', async () => {
  type TemplateField = { elementPath: string; value: any; omitted: boolean }
  const fields: TemplateField[] = [
    { elementPath: 'a', value: 'hello', omitted: false },     // included
    { elementPath: 'b', value: null, omitted: true },          // excluded (omitted)
    { elementPath: 'c', value: undefined, omitted: false },    // excluded (value undefined)
    { elementPath: 'd', value: 0, omitted: false },            // included (falsy but defined)
    { elementPath: 'e', value: false, omitted: false },        // included (falsy but defined)
    { elementPath: 'f', value: '', omitted: false },           // included (empty string)
  ]

  const overrides: Record<string, any> = {}
  for (const field of fields) {
    if (!field.omitted && field.value !== undefined) {
      overrides[field.elementPath] = field.value
    }
  }

  expect(overrides).toHaveProperty('a', 'hello')
  expect(overrides).not.toHaveProperty('b')
  expect(overrides).not.toHaveProperty('c')
  expect(overrides).toHaveProperty('d', 0)
  expect(overrides).toHaveProperty('e', false)
  expect(overrides).toHaveProperty('f', '')
})

// ─────────────────────────────────────────────────────────────────────────────
// SEND FAILURE
// ─────────────────────────────────────────────────────────────────────────────

test('send failure via template returns success=false and records failed event', async () => {
  // Intentionally use a stream that does NOT exist in MiniStack
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Template Failure System',
    inputs: [
      {
        name: 'Failure Input',
        type: 'kinesis',
        config: { streamName: 'tmpl-fail-stream-does-not-exist', region: 'us-east-1' },
      },
    ],
    outputs: [],
  })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'FailEvent',
    elements: [
      {
        name: 'id',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'fail-id' } },
      },
    ],
  })

  const template = await page.evaluate(async (input) => {
    return (window as any).app.api.templates.create(input)
  }, {
    systemId: system.id,
    folderId: null,
    name: 'Fail Template',
    schemaId: schema.id,
    inputId: system.inputs[0].id,
    profileIds: [],
    fields: [{ elementPath: 'id', value: 'fail-id', omitted: false }],
  })

  const session = await page.evaluate(async (systemId) => {
    return (window as any).app.api.sessions.create(systemId)
  }, system.id)

  const overrides: Record<string, any> = {}
  for (const field of template.fields) {
    if (!field.omitted && field.value !== undefined) {
      overrides[field.elementPath] = field.value
    }
  }

  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      profileIds: [],
      overrides: args.overrides,
    })
  }, { systemId: system.id, schemaId: template.schemaId, overrides })

  const result = await page.evaluate(async (args) => {
    return (window as any).app.api.events.send(args.systemId, {
      inputId: args.inputId,
      sessionId: args.sessionId,
      event: args.generated,
      cloud: { aws: { profile: 'staging-profile' } },
    })
  }, {
    systemId: system.id,
    inputId: template.inputId,
    sessionId: session.id,
    generated,
  })

  expect(result.success).toBe(false)
  expect(result.error).toBeTruthy()

  const history = await page.evaluate(async (args) => {
    return (window as any).app.api.sessions.get(args.systemId, args.sessionId)
  }, { systemId: system.id, sessionId: session.id })

  const sentEvents = history.events.filter((e: any) => e.direction === 'sent')
  expect(sentEvents).toHaveLength(1)
  expect(sentEvents[0].status).toBe('failed')
  expect(sentEvents[0].error).toBeTruthy()
})
