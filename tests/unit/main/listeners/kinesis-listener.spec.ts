import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { KinesisListener, evaluateJsonPath } from '../../../../src/main/services/listeners/kinesis-listener'
import type { KinesisListenerOptions } from '../../../../src/main/services/listeners/kinesis-listener'
import type { ListenerConfig } from '../../../../src/shared/models'
import type { KinesisConfig } from '../../../../src/shared/models'

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures the variable is defined before the vi.mock factory runs.
// Regular (non-arrow) functions are used as constructors to avoid TypeError in Vitest 4.
// ---------------------------------------------------------------------------

const mockSend = vi.hoisted(() => vi.fn())

vi.mock('@aws-sdk/client-kinesis', () => ({
  /* eslint-disable @typescript-eslint/no-explicit-any */
  KinesisClient: vi.fn(function (this: any) {
    this.send = mockSend
  }),
  DescribeStreamCommand: vi.fn(function (this: any, input: unknown) {
    this.input = input
  }),
  GetShardIteratorCommand: vi.fn(function (this: any, input: unknown) {
    this.input = input
  }),
  GetRecordsCommand: vi.fn(function (this: any, input: unknown) {
    this.input = input
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */
}))

vi.mock('@aws-sdk/credential-providers', () => ({
  fromIni: vi.fn().mockReturnValue({})
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPushService() {
  return {
    sendListenerLifecycle: vi.fn(),
    sendListenerData: vi.fn(),
    sendListenerError: vi.fn(),
    sendLogEntry: vi.fn()
  }
}

function makeDefaultConfig(): ListenerConfig {
  return {
    outputId: 'output-1',
    sessionId: 'session-1'
  }
}

function makeKinesisConfig(): KinesisConfig {
  return { streamName: 'my-stream', region: 'us-east-1' }
}

function makeOptions(overrides: Partial<KinesisListenerOptions> = {}): KinesisListenerOptions {
  return {
    listenerId: 'listener-1',
    listenerConfig: makeDefaultConfig(),
    kinesisConfig: makeKinesisConfig(),
    awsProfile: 'default',
    pollInterval: 0,
    ...overrides
  }
}

function encodeRecord(obj: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(obj), 'utf-8')
}

// ---------------------------------------------------------------------------
// evaluateJsonPath
// ---------------------------------------------------------------------------

describe('evaluateJsonPath', () => {
  it('returns the root object for "$"', () => {
    const obj = { a: 1 }
    expect(evaluateJsonPath(obj, '$')).toBe(obj)
  })

  it('returns top-level property', () => {
    expect(evaluateJsonPath({ a: 42 }, '$.a')).toBe(42)
  })

  it('returns nested property', () => {
    expect(evaluateJsonPath({ a: { b: 'hello' } }, '$.a.b')).toBe('hello')
  })

  it('returns array element by index', () => {
    expect(evaluateJsonPath({ arr: ['x', 'y', 'z'] }, '$.arr[1]')).toBe('y')
  })

  it('returns undefined for missing path', () => {
    expect(evaluateJsonPath({ a: 1 }, '$.b')).toBeUndefined()
  })

  it('returns undefined for path that does not start with $', () => {
    expect(evaluateJsonPath({ a: 1 }, 'a')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// KinesisListener - start() and polling loop
// ---------------------------------------------------------------------------

describe('KinesisListener', () => {
  let pushService: ReturnType<typeof makeMockPushService>

  beforeEach(() => {
    pushService = makeMockPushService()
    mockSend.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('start()', () => {
    it('calls DescribeStream, emits running lifecycle, and starts polling', async () => {
      mockSend
        .mockResolvedValueOnce({
          // DescribeStream
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({
          // GetShardIterator
          ShardIterator: 'iter-001'
        })
        .mockResolvedValue({
          // GetRecords — return empty, then stop
          Records: [],
          NextShardIterator: 'iter-002'
        })

      const listener = new KinesisListener(makeOptions(), pushService as any)

      await listener.start()
      await listener.stop()

      expect(pushService.sendListenerLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'running', previousState: 'starting' })
      )
    })

    it('emits error lifecycle when DescribeStream fails', async () => {
      mockSend.mockRejectedValueOnce(new Error('ResourceNotFoundException'))

      const listener = new KinesisListener(makeOptions(), pushService as any)

      await expect(listener.start()).rejects.toThrow('ResourceNotFoundException')
      expect(pushService.sendListenerLifecycle).not.toHaveBeenCalledWith(
        expect.objectContaining({ state: 'running' })
      )
    })

    it('emits error lifecycle from polling loop on fatal error', async () => {
      mockSend
        .mockResolvedValueOnce({
          // DescribeStream
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({
          // GetShardIterator
          ShardIterator: 'iter-001'
        })
        .mockRejectedValueOnce(Object.assign(new Error('InternalFailure'), { name: 'InternalFailure' }))

      const listener = new KinesisListener(makeOptions(), pushService as any)
      await listener.start()

      // Allow the polling promise to settle
      await new Promise((r) => setTimeout(r, 10))

      expect(pushService.sendListenerLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'error', previousState: 'running' })
      )
    })
  })

  describe('polling loop — record decoding', () => {
    it('decodes Base64 → UTF-8 → JSON and emits ListenerDataEvent', async () => {
      const payload = { orderId: 'order-42', status: 'shipped' }

      mockSend
        .mockResolvedValueOnce({
          // DescribeStream
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({
          // GetShardIterator
          ShardIterator: 'iter-001'
        })
        .mockResolvedValueOnce({
          // GetRecords — one record
          Records: [
            { Data: encodeRecord(payload), SequenceNumber: 'seq-1', PartitionKey: 'pk-1' }
          ],
          NextShardIterator: 'iter-002'
        })
        .mockResolvedValue({ Records: [], NextShardIterator: 'iter-003' })

      const listener = new KinesisListener(makeOptions(), pushService as any)
      await listener.start()

      // Allow GetRecords to be called
      await new Promise((r) => setTimeout(r, 10))
      await listener.stop()

      expect(pushService.sendListenerData).toHaveBeenCalledWith(
        expect.objectContaining({
          listenerId: 'listener-1',
          sessionId: 'session-1',
          event: expect.objectContaining({
            direction: 'received',
            payload,
            outputId: 'output-1',
            listenerId: 'listener-1'
          })
        })
      )
    })

    it('skips non-JSON records without throwing', async () => {
      mockSend
        .mockResolvedValueOnce({
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({ ShardIterator: 'iter-001' })
        .mockResolvedValueOnce({
          Records: [{ Data: Buffer.from('not-json'), SequenceNumber: 'seq-1' }],
          NextShardIterator: 'iter-002'
        })
        .mockResolvedValue({ Records: [], NextShardIterator: 'iter-003' })

      const listener = new KinesisListener(makeOptions(), pushService as any)
      await listener.start()

      await new Promise((r) => setTimeout(r, 10))
      await listener.stop()

      expect(pushService.sendListenerData).not.toHaveBeenCalled()
    })

    it('skips records with no Data field', async () => {
      mockSend
        .mockResolvedValueOnce({
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({ ShardIterator: 'iter-001' })
        .mockResolvedValueOnce({
          Records: [{ SequenceNumber: 'seq-1' }],
          NextShardIterator: 'iter-002'
        })
        .mockResolvedValue({ Records: [], NextShardIterator: 'iter-003' })

      const listener = new KinesisListener(makeOptions(), pushService as any)
      await listener.start()

      await new Promise((r) => setTimeout(r, 10))
      await listener.stop()

      expect(pushService.sendListenerData).not.toHaveBeenCalled()
    })
  })

  describe('polling loop — ExpiredIteratorException handling', () => {
    it('re-acquires shard iterator and emits recoverable error on ExpiredIteratorException', async () => {
      const expiredErr = Object.assign(new Error('Expired'), { name: 'ExpiredIteratorException' })

      mockSend
        .mockResolvedValueOnce({
          // DescribeStream
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({
          // Initial GetShardIterator
          ShardIterator: 'iter-001'
        })
        .mockRejectedValueOnce(expiredErr) // GetRecords throws expired
        .mockResolvedValueOnce({
          // Re-acquire GetShardIterator
          ShardIterator: 'iter-fresh'
        })
        .mockResolvedValue({ Records: [], NextShardIterator: 'iter-fresh-2' })

      const listener = new KinesisListener(makeOptions(), pushService as any)
      await listener.start()

      await new Promise((r) => setTimeout(r, 20))
      await listener.stop()

      expect(pushService.sendListenerError).toHaveBeenCalledWith(
        expect.objectContaining({
          listenerId: 'listener-1',
          recoverable: true
        })
      )
      // GetShardIterator called twice: initial + refresh
      const calls = mockSend.mock.calls
      const iteratorCalls = calls.filter((c) => {
        const cmd = c[0] as { input?: { ShardIteratorType?: string } }
        return cmd?.input?.ShardIteratorType === 'LATEST'
      })
      expect(iteratorCalls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('stop()', () => {
    it('stops the polling loop cleanly', async () => {
      mockSend
        .mockResolvedValueOnce({
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({ ShardIterator: 'iter-001' })
        .mockResolvedValue({ Records: [], NextShardIterator: 'iter-002' })

      const listener = new KinesisListener(makeOptions(), pushService as any)
      await listener.start()
      await listener.stop()

      // No error lifecycle should be emitted on clean stop
      const errorCalls = pushService.sendListenerLifecycle.mock.calls.filter(
        (c: unknown[]) => (c[0] as { state?: string })?.state === 'error'
      )
      expect(errorCalls).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Filter logic
  // ---------------------------------------------------------------------------

  describe('filter logic', () => {
    async function runWithFilters(
      config: Partial<ListenerConfig>,
      payload: Record<string, unknown>
    ): Promise<boolean> {
      const listenerConfig: ListenerConfig = { ...makeDefaultConfig(), ...config }
      mockSend
        .mockResolvedValueOnce({
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({ ShardIterator: 'iter-001' })
        .mockResolvedValueOnce({
          Records: [{ Data: encodeRecord(payload), SequenceNumber: 'seq-1' }],
          NextShardIterator: 'iter-002'
        })
        .mockResolvedValue({ Records: [], NextShardIterator: 'iter-003' })

      const listener = new KinesisListener(
        makeOptions({ listenerConfig }),
        pushService as any
      )
      await listener.start()
      await new Promise((r) => setTimeout(r, 10))
      await listener.stop()

      return pushService.sendListenerData.mock.calls.length > 0
    }

    it('passes record when no filters configured', async () => {
      const matched = await runWithFilters({}, { eventType: 'order.created' })
      expect(matched).toBe(true)
    })

    it('filters record using jsonpath equals operator', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [
          {
            type: 'jsonpath',
            config: { path: '$.eventType', operator: 'equals', value: 'order.created' }
          }
        ]
      }
      const matched = await runWithFilters(config, { eventType: 'order.created' })
      expect(matched).toBe(true)
    })

    it('rejects record that does not match jsonpath equals', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [
          {
            type: 'jsonpath',
            config: { path: '$.eventType', operator: 'equals', value: 'order.created' }
          }
        ]
      }
      const matched = await runWithFilters(config, { eventType: 'order.shipped' })
      expect(matched).toBe(false)
    })

    it('applies jsonpath exists operator', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [
          { type: 'jsonpath', config: { path: '$.correlationId', operator: 'exists' } }
        ]
      }
      const matched = await runWithFilters(config, { correlationId: 'abc', other: 1 })
      expect(matched).toBe(true)
    })

    it('applies jsonpath notEquals operator', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [
          {
            type: 'jsonpath',
            config: { path: '$.status', operator: 'notEquals', value: 'error' }
          }
        ]
      }
      const matched = await runWithFilters(config, { status: 'success' })
      expect(matched).toBe(true)
    })

    it('applies jsonpath contains operator on string', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [
          {
            type: 'jsonpath',
            config: { path: '$.message', operator: 'contains', value: 'hello' }
          }
        ]
      }
      const matched = await runWithFilters(config, { message: 'say hello world' })
      expect(matched).toBe(true)
    })

    it('applies regex filter', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [{ type: 'regex', config: { pattern: 'order\\.\\d+', flags: 'i' } }]
      }
      const matched = await runWithFilters(config, { id: 'order.123' })
      expect(matched).toBe(true)
    })

    it('applies regex filter with targetPath', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [
          {
            type: 'regex',
            config: { pattern: '^shipped$', targetPath: '$.status' }
          }
        ]
      }
      const matched = await runWithFilters(config, { status: 'shipped' })
      expect(matched).toBe(true)
    })

    it('applies filterMode=any — passes when any filter matches', async () => {
      const config: Partial<ListenerConfig> = {
        filterMode: 'any',
        filters: [
          { type: 'jsonpath', config: { path: '$.a', operator: 'equals', value: 'x' } },
          { type: 'jsonpath', config: { path: '$.b', operator: 'equals', value: 'y' } }
        ]
      }
      // Only $.b matches
      const matched = await runWithFilters(config, { a: 'z', b: 'y' })
      expect(matched).toBe(true)
    })

    it('applies filterMode=all — rejects when not all filters match', async () => {
      const config: Partial<ListenerConfig> = {
        filterMode: 'all',
        filters: [
          { type: 'jsonpath', config: { path: '$.a', operator: 'equals', value: 'x' } },
          { type: 'jsonpath', config: { path: '$.b', operator: 'equals', value: 'y' } }
        ]
      }
      const matched = await runWithFilters(config, { a: 'x', b: 'wrong' })
      expect(matched).toBe(false)
    })

    it('includes unmatched record when includeUnmatched=true', async () => {
      const config: Partial<ListenerConfig> = {
        includeUnmatched: true,
        filters: [
          { type: 'jsonpath', config: { path: '$.eventType', operator: 'equals', value: 'X' } }
        ]
      }
      const matched = await runWithFilters(config, { eventType: 'other' })
      expect(matched).toBe(true)
    })

    it('skips disabled filters', async () => {
      const config: Partial<ListenerConfig> = {
        filters: [
          {
            enabled: false,
            type: 'jsonpath',
            config: { path: '$.eventType', operator: 'equals', value: 'NEVER' }
          }
        ]
      }
      // Disabled filter means no active filters → all records pass
      const matched = await runWithFilters(config, { eventType: 'anything' })
      expect(matched).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // Correlation logic
  // ---------------------------------------------------------------------------

  describe('correlation logic', () => {
    async function runWithCorrelation(
      config: Partial<ListenerConfig>,
      payload: Record<string, unknown>,
      getSentEventPayload?: (id: string) => Record<string, unknown> | undefined
    ): Promise<boolean> {
      const listenerConfig: ListenerConfig = { ...makeDefaultConfig(), ...config }
      mockSend
        .mockResolvedValueOnce({
          StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
        })
        .mockResolvedValueOnce({ ShardIterator: 'iter-001' })
        .mockResolvedValueOnce({
          Records: [{ Data: encodeRecord(payload), SequenceNumber: 'seq-1' }],
          NextShardIterator: 'iter-002'
        })
        .mockResolvedValue({ Records: [], NextShardIterator: 'iter-003' })

      const listener = new KinesisListener(
        makeOptions({ listenerConfig, getSentEventPayload }),
        pushService as any
      )
      await listener.start()
      await new Promise((r) => setTimeout(r, 10))
      await listener.stop()

      return pushService.sendListenerData.mock.calls.length > 0
    }

    it('passes record matching static correlation', async () => {
      const config: Partial<ListenerConfig> = {
        correlation: {
          strategy: 'static',
          receivedPath: '$.correlationId',
          value: 'corr-123'
        }
      }
      const matched = await runWithCorrelation(config, { correlationId: 'corr-123' })
      expect(matched).toBe(true)
    })

    it('rejects record not matching static correlation', async () => {
      const config: Partial<ListenerConfig> = {
        correlation: {
          strategy: 'static',
          receivedPath: '$.correlationId',
          value: 'corr-123'
        }
      }
      const matched = await runWithCorrelation(config, { correlationId: 'other-id' })
      expect(matched).toBe(false)
    })

    it('passes record matching fromSentEvent correlation', async () => {
      const sentPayload = { requestId: 'req-999' }
      const getSentEventPayload = vi.fn().mockReturnValue(sentPayload)
      const config: Partial<ListenerConfig> = {
        correlation: {
          strategy: 'fromSentEvent',
          receivedPath: '$.responseId',
          sentEventId: 'sent-event-1',
          sentPath: '$.requestId'
        }
      }
      const matched = await runWithCorrelation(
        config,
        { responseId: 'req-999' },
        getSentEventPayload
      )
      expect(matched).toBe(true)
    })

    it('passes record when fromSentEvent lookup returns undefined (pass-through)', async () => {
      const getSentEventPayload = vi.fn().mockReturnValue(undefined)
      const config: Partial<ListenerConfig> = {
        correlation: {
          strategy: 'fromSentEvent',
          receivedPath: '$.responseId',
          sentEventId: 'sent-event-1',
          sentPath: '$.requestId'
        }
      }
      const matched = await runWithCorrelation(
        config,
        { responseId: 'whatever' },
        getSentEventPayload
      )
      expect(matched).toBe(true)
    })

    it('applies case-insensitive comparison when caseSensitive=false', async () => {
      const config: Partial<ListenerConfig> = {
        correlation: {
          strategy: 'static',
          receivedPath: '$.correlationId',
          value: 'CORR-ABC',
          caseSensitive: false
        }
      }
      const matched = await runWithCorrelation(config, { correlationId: 'corr-abc' })
      expect(matched).toBe(true)
    })
  })
})
