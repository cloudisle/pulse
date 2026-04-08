/**
 * E2E Integration tests: End-to-End Workflow
 *
 * These tests exercise the full generate → send → listen workflow by launching
 * the real Electron application and driving it through its IPC API.
 * AWS calls are made against MiniStack (a local AWS emulator) started by the
 * Playwright global setup.
 */

import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { type KinesisClient } from '@aws-sdk/client-kinesis'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import {
  makeKinesisClient,
  createStream,
  putRecord,
  launchApp,
  sleep,
  LISTENER_RECEIVE_POLL_ATTEMPTS,
  LISTENER_RECEIVE_POLL_DELAY_MS,
} from './helpers'

let userDataDir: string
let electronApp: ElectronApplication
let page: Page
let kinesis: KinesisClient

test.beforeAll(async () => {
  userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-e2e-workflow-'))
  kinesis = makeKinesisClient()
  ;({ app: electronApp, page } = await launchApp(userDataDir))
})

test.afterAll(async () => {
  await electronApp.close()
  kinesis.destroy()
  await fs.rm(userDataDir, { recursive: true, force: true })
})

// ─────────────────────────────────────────────────────────────────────────────
// HAPPY PATH — full workflow
// ─────────────────────────────────────────────────────────────────────────────

test('full workflow: create system → generate → send to MiniStack → verify session history', async () => {
  const streamName = 'e2e-orders-in'
  await createStream(kinesis, streamName)

  // Step 1: Create system with a Kinesis input
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Order Processing',
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

  // Step 2: Create a schema
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
        name: 'amount',
        required: true,
        dataType: { type: 'number' },
        generationStrategy: { type: 'constant', config: { value: 100 } },
      },
    ],
  })

  // Step 3: Create a session
  const session = await page.evaluate(async (systemId) => {
    return (window as any).app.api.sessions.create(systemId)
  }, system.id)

  expect(session.id).toBeTruthy()

  // Step 4: Generate an event
  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, { schemaId: args.schemaId })
  }, { systemId: system.id, schemaId: schema.id })

  expect(generated.payload.amount).toBe(100)
  expect(typeof generated.payload.orderId).toBe('string')

  // Step 5: Send the event to MiniStack Kinesis
  const sendResult = await page.evaluate(async (args) => {
    return (window as any).app.api.events.send(args.systemId, {
      inputId: args.inputId,
      sessionId: args.sessionId,
      event: args.generated,
      cloud: { aws: { profile: 'staging-profile' } },
    })
  }, { systemId: system.id, inputId, sessionId: session.id, generated })

  expect(sendResult.success).toBe(true)
  expect(sendResult.sessionEventId).toBeTruthy()

  // Step 6: Verify session history shows the sent event
  const history = await page.evaluate(async (args) => {
    return (window as any).app.api.sessions.get(args.systemId, args.sessionId)
  }, { systemId: system.id, sessionId: session.id })

  const sentEvents = history.events.filter((e: any) => e.direction === 'sent')
  expect(sentEvents).toHaveLength(1)
  expect(sentEvents[0].schemaId).toBe(schema.id)
  expect(sentEvents[0].status).toBe('success')
  expect(JSON.parse(sentEvents[0].payload).amount).toBe(100)
})

test('full workflow with environment and profile: variable replacement and overrides apply', async () => {
  const streamName = 'e2e-orders-staging'
  await createStream(kinesis, streamName)

  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Env+Profile System',
    inputs: [
      {
        name: 'Orders Input',
        type: 'kinesis',
        config: { streamName, region: '{{ region }}' },
      },
    ],
    outputs: [],
  })

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
        name: 'amount',
        required: true,
        dataType: { type: 'number' },
        generationStrategy: { type: 'range', config: { min: 1, max: 100, decimals: 2 } },
      },
      {
        name: 'region',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: '{{ region }}' } },
      },
    ],
  })

  const environment = await page.evaluate(async (input) => {
    return (window as any).app.api.environments.create(input)
  }, {
    systemId: system.id,
    name: 'staging',
    variables: [{ key: 'region', value: 'eu-west-1', sensitive: false }],
  })

  const profile = await page.evaluate(async (input) => {
    return (window as any).app.api.profiles.create(input)
  }, {
    systemId: system.id,
    name: 'HighValue',
    overrides: [{ elementPath: 'amount', action: 'set', value: 999.99 }],
  })

  const session = await page.evaluate(async (systemId) => {
    return (window as any).app.api.sessions.create(systemId)
  }, system.id)

  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      environmentId: args.environmentId,
      profileIds: [args.profileId],
    })
  }, { systemId: system.id, schemaId: schema.id, environmentId: environment.id, profileId: profile.id })

  // Profile override applies
  expect(generated.payload.amount).toBe(999.99)
  // Variable replacement applies
  expect(generated.payload.region).toBe('eu-west-1')
  expect(generated.appliedProfiles).toContain(profile.id)

  const sendResult = await page.evaluate(async (args) => {
    return (window as any).app.api.events.send(args.systemId, {
      inputId: args.inputId,
      sessionId: args.sessionId,
      event: args.generated,
      cloud: { aws: { profile: 'staging-profile' } },
      environmentId: args.environmentId,
    })
  }, {
    systemId: system.id,
    inputId: system.inputs[0].id,
    sessionId: session.id,
    generated,
    environmentId: environment.id,
  })

  expect(sendResult.success).toBe(true)

  const history = await page.evaluate(async (args) => {
    return (window as any).app.api.sessions.get(args.systemId, args.sessionId)
  }, { systemId: system.id, sessionId: session.id })

  const sentEvents = history.events.filter((e: any) => e.direction === 'sent')
  expect(sentEvents).toHaveLength(1)
  expect(JSON.parse(sentEvents[0].payload).amount).toBe(999.99)
  expect(sentEvents[0].profileIds).toContain(profile.id)
})

// ─────────────────────────────────────────────────────────────────────────────
// LISTENER LIFECYCLE — start / poll / stop
// ─────────────────────────────────────────────────────────────────────────────

test('listener lifecycle: start on MiniStack stream, receive record, stop', async () => {
  const outputStreamName = 'e2e-orders-out'
  await createStream(kinesis, outputStreamName)

  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Listener System',
    inputs: [],
    outputs: [
      {
        name: 'Orders Output',
        type: 'kinesis',
        contentType: 'json',
        config: { streamName: outputStreamName, region: 'us-east-1' },
        listenerDefaults: {
          filterMode: 'all',
          includeUnmatched: true,
          filters: [],
        },
      },
    ],
  })

  const session = await page.evaluate(async (systemId) => {
    return (window as any).app.api.sessions.create(systemId)
  }, system.id)

  const outputId: string = system.outputs[0].id

  // Start the listener
  const startResult = await page.evaluate(async (args) => {
    return (window as any).app.api.listeners.start({
      systemId: args.systemId,
      outputId: args.outputId,
      sessionId: args.sessionId,
      cloud: { aws: { profile: 'test-profile' } },
    })
  }, { systemId: system.id, outputId, sessionId: session.id })

  expect(startResult.listenerId).toBeTruthy()

  // Allow the listener to enter polling state
  await sleep(1500)

  // Put a record on the stream via MiniStack
  const receivedPayload = { correlationId: 'test-corr-1', result: 'ok' }
  await putRecord(kinesis, outputStreamName, receivedPayload)

  // Poll session history until the received event appears
  let receivedEvents: any[] = []
  for (let i = 0; i < LISTENER_RECEIVE_POLL_ATTEMPTS; i++) {
    await sleep(LISTENER_RECEIVE_POLL_DELAY_MS)
    const history = await page.evaluate(async (args) => {
      return (window as any).app.api.sessions.get(args.systemId, args.sessionId)
    }, { systemId: system.id, sessionId: session.id })
    receivedEvents = history.events.filter((e: any) => e.direction === 'received')
    if (receivedEvents.length > 0) break
  }

  // Stop the listener
  await page.evaluate(async (listenerId) => {
    return (window as any).app.api.listeners.stop(listenerId)
  }, startResult.listenerId)

  expect(receivedEvents).toHaveLength(1)
  const rcvPayload = JSON.parse(receivedEvents[0].payload)
  expect(rcvPayload.correlationId).toBe('test-corr-1')
  expect(rcvPayload.result).toBe('ok')
})

// ─────────────────────────────────────────────────────────────────────────────
// ERROR SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

test('send to a non-existent Kinesis stream returns success=false with error', async () => {
  // Intentionally use a stream name that does NOT exist in MiniStack
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Error System',
    inputs: [
      {
        name: 'Error Input',
        type: 'kinesis',
        config: { streamName: 'stream-does-not-exist-e2e', region: 'us-east-1' },
      },
    ],
    outputs: [],
  })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'ErrorEvent',
    elements: [
      {
        name: 'id',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'err-id-1' } },
      },
    ],
  })

  const session = await page.evaluate(async (systemId) => {
    return (window as any).app.api.sessions.create(systemId)
  }, system.id)

  const generated = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, { schemaId: args.schemaId })
  }, { systemId: system.id, schemaId: schema.id })

  expect(generated.payload.id).toBe('err-id-1')

  const result = await page.evaluate(async (args) => {
    return (window as any).app.api.events.send(args.systemId, {
      inputId: args.inputId,
      sessionId: args.sessionId,
      event: args.generated,
      cloud: { aws: { profile: 'staging-profile' } },
    })
  }, {
    systemId: system.id,
    inputId: system.inputs[0].id,
    sessionId: session.id,
    generated,
  })

  expect(result.success).toBe(false)
  expect(result.error).toBeTruthy()

  // Failed event is still recorded in session history with status 'failed'
  const history = await page.evaluate(async (args) => {
    return (window as any).app.api.sessions.get(args.systemId, args.sessionId)
  }, { systemId: system.id, sessionId: session.id })

  const failedEvents = history.events.filter((e: any) => e.direction === 'sent')
  expect(failedEvents).toHaveLength(1)
  expect(failedEvents[0].status).toBe('failed')
  expect(failedEvents[0].error).toBeTruthy()
})

test('send to an unknown system throws an error', async () => {
  const err = await page.evaluate(async (args) => {
    try {
      await (window as any).app.api.events.send('non-existent-system-id', {
        inputId: args.inputId,
        sessionId: 'session-1',
        event: { schemaId: 'schema-1', payload: { id: '1' }, appliedProfiles: [] },
        cloud: { aws: { profile: 'default' } },
      })
      return null
    } catch (e: any) {
      return e.message as string
    }
  }, { inputId: 'input-1' })

  expect(err).toMatch(/not found/i)
})

test('generate for a missing schema throws an error', async () => {
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, { name: 'E2E Missing Schema System', inputs: [], outputs: [] })

  const err = await page.evaluate(async (args) => {
    try {
      await (window as any).app.api.events.generate(args.systemId, { schemaId: 'no-such-schema' })
      return null
    } catch (e: any) {
      return e.message as string
    }
  }, { systemId: system.id })

  expect(err).toMatch(/not found/i)
})

// ─────────────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

test('generate with no profiles returns empty appliedProfiles', async () => {
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, { name: 'E2E No Profile System', inputs: [], outputs: [] })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'NP',
    elements: [
      {
        name: 'value',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'constant', config: { value: 'hello' } },
      },
    ],
  })

  const result = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, { schemaId: args.schemaId })
  }, { systemId: system.id, schemaId: schema.id })

  expect(result.appliedProfiles).toEqual([])
  expect(result.payload.value).toBe('hello')
})

test('generate with ad-hoc overrides replaces values from the input', async () => {
  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, { name: 'E2E Ad-Hoc Overrides', inputs: [], outputs: [] })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'AHO',
    elements: [
      {
        name: 'orderId',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'faker', config: { method: 'string.uuid' } },
      },
      {
        name: 'amount',
        required: true,
        dataType: { type: 'number' },
        generationStrategy: { type: 'range', config: { min: 1, max: 100 } },
      },
    ],
  })

  const result = await page.evaluate(async (args) => {
    return (window as any).app.api.events.generate(args.systemId, {
      schemaId: args.schemaId,
      overrides: { amount: 42 },
    })
  }, { systemId: system.id, schemaId: schema.id })

  expect(result.payload.amount).toBe(42)
  expect(typeof result.payload.orderId).toBe('string')
  expect(result.payload.orderId).toBeTruthy()
})

test('session history persists both sent events across multiple sends', async () => {
  const streamName = 'e2e-multi-stream'
  await createStream(kinesis, streamName)

  const system = await page.evaluate(async (input) => {
    return (window as any).app.api.systems.create(input)
  }, {
    name: 'E2E Multi-Event System',
    inputs: [
      {
        name: 'Multi Input',
        type: 'kinesis',
        config: { streamName, region: 'us-east-1' },
      },
    ],
    outputs: [],
  })

  const schema = await page.evaluate(async (input) => {
    return (window as any).app.api.schemas.create(input)
  }, {
    systemId: system.id,
    name: 'MultiEvent',
    elements: [
      {
        name: 'id',
        required: true,
        dataType: { type: 'string' },
        generationStrategy: { type: 'faker', config: { method: 'string.uuid' } },
      },
    ],
  })

  const session = await page.evaluate(async (systemId) => {
    return (window as any).app.api.sessions.create(systemId)
  }, system.id)

  // Send two events
  for (let i = 0; i < 2; i++) {
    const generated = await page.evaluate(async (args) => {
      return (window as any).app.api.events.generate(args.systemId, { schemaId: args.schemaId })
    }, { systemId: system.id, schemaId: schema.id })

    const sendResult = await page.evaluate(async (args) => {
      return (window as any).app.api.events.send(args.systemId, {
        inputId: args.inputId,
        sessionId: args.sessionId,
        event: args.generated,
        cloud: { aws: { profile: 'staging-profile' } },
      })
    }, { systemId: system.id, inputId: system.inputs[0].id, sessionId: session.id, generated })

    expect(sendResult.success).toBe(true)
  }

  const history = await page.evaluate(async (args) => {
    return (window as any).app.api.sessions.get(args.systemId, args.sessionId)
  }, { systemId: system.id, sessionId: session.id })

  const sentEvents = history.events.filter((e: any) => e.direction === 'sent')
  expect(sentEvents).toHaveLength(2)
})
