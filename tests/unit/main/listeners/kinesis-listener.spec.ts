import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KinesisListener } from '@main/cloud/kinesis/kinesis-listener'
import type { MessageHandler } from '@main/services/listeners/listener'

const mockSend = vi.hoisted(() => vi.fn())
const mockFromIni = vi.hoisted(() => vi.fn().mockReturnValue({ provider: 'ini' }))
const mockRandomUUID = vi.hoisted(() => vi.fn(() => 'listener-fixed-id'))
const mockDeaggregateSync = vi.hoisted(() => vi.fn())

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
  fromIni: mockFromIni
}))

vi.mock('crypto', () => ({
  randomUUID: mockRandomUUID
}))

vi.mock('aws-kinesis-agg', () => ({
  deaggregateSync: mockDeaggregateSync
}))

function createHandler(): MessageHandler {
  return {
    handle: vi.fn(),
    onError: vi.fn()
  }
}

function createListener() {
  return new KinesisListener({
    config: {
      streamName: 'orders-stream',
      region: 'us-east-1',
      pollInterval: 0
    },
    aws: { profile: 'dev-profile' }
  })
}

describe('KinesisListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDeaggregateSync.mockImplementation((record: unknown, _: boolean, callback: (err: Error | null, userRecords?: unknown[]) => void) => {
      callback(null, [record])
    })
  })

  it('builds the client with region and fromIni profile credentials', () => {
    createListener()

    expect(mockFromIni).toHaveBeenCalledWith({ profile: 'dev-profile' })
  })

  it('rebuilds credentials and retries startup when AWS session is expired', async () => {
    const expired = Object.assign(new Error('Your session has expired'), {
      name: 'ExpiredTokenException'
    })

    mockSend
      .mockRejectedValueOnce(expired)
      .mockResolvedValueOnce({ StreamDescription: { Shards: [] } })

    const listener = createListener()
    const handler = createHandler()

    await listener.start(handler)

    expect(mockFromIni).toHaveBeenCalledTimes(2)
    expect(handler.onError).not.toHaveBeenCalled()
  })

  it('polls records and forwards decoded message payloads to handler.handle', async () => {
    mockSend
      .mockResolvedValueOnce({
        StreamDescription: { Shards: [{ ShardId: 'shard-000' }] }
      })
      .mockResolvedValueOnce({ ShardIterator: 'iter-1' })
      .mockResolvedValueOnce({
        Records: [
          {
            Data: Buffer.from('{"kind":"created"}', 'utf-8'),
            SequenceNumber: 'seq-1',
            PartitionKey: 'pk-1'
          }
        ],
        NextShardIterator: 'iter-2'
      })
      .mockResolvedValue({ Records: [], NextShardIterator: 'iter-3' })

    const listener = createListener()
    const handler = createHandler()

    await listener.start(handler)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await listener.stop()

    expect(handler.handle).toHaveBeenCalledWith('listener-fixed-id', {
      data: '{"kind":"created"}',
      metadata: {
        sequenceNumber: 'seq-1',
        partitionKey: 'pk-1'
      }
    })
  })

  it('ignores records without Data', async () => {
    mockSend
      .mockResolvedValueOnce({ StreamDescription: { Shards: [{ ShardId: 'shard-001' }] } })
      .mockResolvedValueOnce({ ShardIterator: 'iter-1' })
      .mockResolvedValueOnce({
        Records: [{ SequenceNumber: 'seq-1' }],
        NextShardIterator: 'iter-2'
      })
      .mockResolvedValue({ Records: [], NextShardIterator: 'iter-3' })

    const listener = createListener()
    const handler = createHandler()

    await listener.start(handler)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await listener.stop()

    expect(handler.handle).not.toHaveBeenCalled()
  })

  it('reports recoverable ExpiredIteratorException and re-acquires iterator', async () => {
    const expired = Object.assign(new Error('expired'), { name: 'ExpiredIteratorException' })

    mockSend
      .mockResolvedValueOnce({ StreamDescription: { Shards: [{ ShardId: 'shard-002' }] } })
      .mockResolvedValueOnce({ ShardIterator: 'iter-1' })
      .mockRejectedValueOnce(expired)
      .mockResolvedValueOnce({ ShardIterator: 'iter-fresh' })
      .mockResolvedValue({ Records: [], NextShardIterator: 'iter-next' })

    const listener = createListener()
    const handler = createHandler()

    await listener.start(handler)
    await new Promise((resolve) => setTimeout(resolve, 15))
    await listener.stop()

    expect(handler.onError).toHaveBeenCalledWith(
      'listener-fixed-id',
      expect.objectContaining({
        name: 'ExpiredIteratorException',
        recoverable: true,
        metadata: {
          ShardId: 'shard-002',
          StreamName: 'orders-stream'
        }
      })
    )

    const iteratorCalls = mockSend.mock.calls.filter((args) => {
      const cmd = args[0] as { input?: { ShardIteratorType?: string } }
      return cmd.input?.ShardIteratorType === 'LATEST'
    })
    expect(iteratorCalls.length).toBeGreaterThanOrEqual(2)
  })

  it('reports non-recoverable polling errors through handler.onError', async () => {
    const fatal = Object.assign(new Error('InternalFailure'), { name: 'InternalFailure' })

    mockSend
      .mockResolvedValueOnce({ StreamDescription: { Shards: [{ ShardId: 'shard-003' }] } })
      .mockResolvedValueOnce({ ShardIterator: 'iter-1' })
      .mockRejectedValueOnce(fatal)

    const listener = createListener()
    const handler = createHandler()

    await listener.start(handler)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(handler.onError).toHaveBeenCalledWith(
      'listener-fixed-id',
      expect.objectContaining({
        name: 'InternalFailure',
        recoverable: false,
        metadata: {
          ShardId: 'shard-003',
          StreamName: 'orders-stream'
        }
      })
    )
  })

  it('deaggregates KPL records before forwarding to handler.handle', async () => {
    mockDeaggregateSync.mockImplementation((_: unknown, __: boolean, callback: (err: Error | null, userRecords?: unknown[]) => void) => {
      callback(null, [
        {
          Data: Buffer.from('{"kind":"created"}', 'utf-8').toString('base64'),
          SequenceNumber: 'seq-agg-1',
          PartitionKey: 'pk-agg-1'
        },
        {
          Data: Buffer.from('{"kind":"updated"}', 'utf-8').toString('base64'),
          SequenceNumber: 'seq-agg-2',
          PartitionKey: 'pk-agg-2'
        }
      ])
    })

    mockSend
      .mockResolvedValueOnce({ StreamDescription: { Shards: [{ ShardId: 'shard-004' }] } })
      .mockResolvedValueOnce({ ShardIterator: 'iter-1' })
      .mockResolvedValueOnce({
        Records: [
          {
            Data: Buffer.from('f3899ac2', 'hex'),
            SequenceNumber: 'seq-envelope',
            PartitionKey: 'pk-envelope'
          }
        ],
        NextShardIterator: 'iter-2'
      })
      .mockResolvedValue({ Records: [], NextShardIterator: 'iter-3' })

    const listener = createListener()
    const handler = createHandler()

    await listener.start(handler)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await listener.stop()

    expect(handler.handle).toHaveBeenNthCalledWith(1, 'listener-fixed-id', {
      data: '{"kind":"created"}',
      metadata: {
        sequenceNumber: 'seq-agg-1',
        partitionKey: 'pk-agg-1'
      }
    })
    expect(handler.handle).toHaveBeenNthCalledWith(2, 'listener-fixed-id', {
      data: '{"kind":"updated"}',
      metadata: {
        sequenceNumber: 'seq-agg-2',
        partitionKey: 'pk-agg-2'
      }
    })
  })

  it('falls back to original record when deaggregation fails', async () => {
    mockDeaggregateSync.mockImplementation((_: unknown, __: boolean, callback: (err: Error | null) => void) => {
      callback(new Error('deaggregation failed'))
    })

    mockSend
      .mockResolvedValueOnce({ StreamDescription: { Shards: [{ ShardId: 'shard-005' }] } })
      .mockResolvedValueOnce({ ShardIterator: 'iter-1' })
      .mockResolvedValueOnce({
        Records: [
          {
            Data: Buffer.from('{"kind":"raw"}', 'utf-8'),
            SequenceNumber: 'seq-raw',
            PartitionKey: 'pk-raw'
          }
        ],
        NextShardIterator: 'iter-2'
      })
      .mockResolvedValue({ Records: [], NextShardIterator: 'iter-3' })

    const listener = createListener()
    const handler = createHandler()

    await listener.start(handler)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await listener.stop()

    expect(handler.handle).toHaveBeenCalledWith('listener-fixed-id', {
      data: '{"kind":"raw"}',
      metadata: {
        sequenceNumber: 'seq-raw',
        partitionKey: 'pk-raw'
      }
    })
  })
})
