import {
  KinesisClient,
  DescribeStreamCommand,
  GetShardIteratorCommand,
  GetRecordsCommand
} from '@aws-sdk/client-kinesis'
import { fromIni } from '@aws-sdk/credential-providers'
import { randomUUID } from 'crypto'
import type { PushService } from '../push.service'
import type {
  ListenerConfig,
  ListenerFilter,
  JsonPathFilterConfig,
  RegexFilterConfig
} from '../../../shared/models'
import type { KinesisConfig } from '../../../shared/models'
import type { SessionEvent } from '../../../shared/models'

export interface KinesisListenerOptions {
  listenerId: string
  listenerConfig: ListenerConfig
  kinesisConfig: KinesisConfig
  awsProfile: string
  pollInterval?: number
  getSentEventPayload?: (eventId: string) => Record<string, unknown> | undefined
}

/**
 * Evaluates a simple JSONPath expression (dot-notation, array index) on an object.
 * Supports expressions like: `$`, `$.foo`, `$.foo.bar`, `$.arr[0]`, `$.foo.arr[1].baz`
 */
export function evaluateJsonPath(obj: unknown, path: string): unknown {
  if (!path.startsWith('$')) return undefined
  const inner = path.slice(1)
  if (inner === '' || inner === '.') return obj

  const normalized = inner.startsWith('.') ? inner.slice(1) : inner
  if (!normalized) return obj

  const segment = /([^.[]+)|\[(\d+)\]/g
  let match: RegExpExecArray | null
  const parts: (string | number)[] = []

  while ((match = segment.exec(normalized)) !== null) {
    if (match[1] !== undefined) parts.push(match[1])
    else if (match[2] !== undefined) parts.push(parseInt(match[2], 10))
  }

  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[part]
  }
  return current
}

export class KinesisListener {
  private stopped = false
  private readonly client: KinesisClient

  constructor(
    private readonly options: KinesisListenerOptions,
    private readonly pushService: PushService
  ) {
    this.client = new KinesisClient({
      region: options.kinesisConfig.region,
      credentials: fromIni({ profile: options.awsProfile })
    })
  }

  /**
   * Describes the stream to obtain shard IDs, emits `running` lifecycle event,
   * then starts the polling loop for each shard asynchronously.
   */
  async start(): Promise<void> {
    const { kinesisConfig, listenerId, listenerConfig } = this.options

    const describeResult = await this.client.send(
      new DescribeStreamCommand({ StreamName: kinesisConfig.streamName })
    )

    const shards = describeResult.StreamDescription?.Shards ?? []

    this.pushService.sendListenerLifecycle({
      listenerId,
      outputId: listenerConfig.outputId,
      sessionId: listenerConfig.sessionId,
      previousState: 'starting',
      state: 'running',
      timestamp: new Date().toISOString()
    })

    for (const shard of shards) {
      if (shard.ShardId) {
        this.pollShard(shard.ShardId).catch((err: unknown) => {
          if (!this.stopped) {
            this.pushService.sendListenerLifecycle({
              listenerId,
              outputId: listenerConfig.outputId,
              sessionId: listenerConfig.sessionId,
              previousState: 'running',
              state: 'error',
              timestamp: new Date().toISOString(),
              error: err instanceof Error ? err.message : String(err)
            })
          }
        })
      }
    }
  }

  /** Signals the polling loop to stop. */
  stop(): Promise<void> {
    this.stopped = true
    return Promise.resolve()
  }

  private async pollShard(shardId: string): Promise<void> {
    const { pollInterval = 1000 } = this.options

    let shardIterator = await this.getShardIterator(shardId)

    while (!this.stopped) {
      try {
        const result = await this.client.send(
          new GetRecordsCommand({ ShardIterator: shardIterator, Limit: 100 })
        )

        for (const record of result.Records ?? []) {
          this.processRecord(record)
        }

        shardIterator = result.NextShardIterator ?? shardIterator

        if (!this.stopped) {
          await this.sleep(pollInterval)
        }
      } catch (err: unknown) {
        const errName = (err as { name?: string })?.name
        if (errName === 'ExpiredIteratorException') {
          this.pushService.sendListenerError({
            listenerId: this.options.listenerId,
            error: 'Shard iterator expired, re-acquiring',
            timestamp: new Date().toISOString(),
            recoverable: true
          })
          shardIterator = await this.getShardIterator(shardId)
        } else {
          throw err
        }
      }
    }
  }

  private async getShardIterator(shardId: string): Promise<string> {
    const result = await this.client.send(
      new GetShardIteratorCommand({
        StreamName: this.options.kinesisConfig.streamName,
        ShardId: shardId,
        ShardIteratorType: 'LATEST'
      })
    )

    if (!result.ShardIterator) {
      throw new Error(`Failed to get shard iterator for shard ${shardId}`)
    }

    return result.ShardIterator
  }

  private processRecord(record: {
    Data?: Uint8Array
    SequenceNumber?: string
    PartitionKey?: string
  }): void {
    const { listenerId, listenerConfig } = this.options

    if (!record.Data) return

    const rawString = Buffer.from(record.Data).toString('utf-8')

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawString) as Record<string, unknown>
    } catch {
      return
    }

    if (!this.matches(payload)) return

    const sessionEvent: SessionEvent = {
      id: randomUUID(),
      sessionId: listenerConfig.sessionId,
      direction: 'received',
      timestamp: new Date().toISOString(),
      outputId: listenerConfig.outputId,
      listenerId,
      payload,
      metadata: {
        sequenceNumber: record.SequenceNumber,
        partitionKey: record.PartitionKey
      },
      status: 'success'
    }

    this.pushService.sendListenerData({
      listenerId,
      sessionId: listenerConfig.sessionId,
      event: sessionEvent
    })
  }

  private matches(payload: Record<string, unknown>): boolean {
    const { listenerConfig } = this.options

    if (listenerConfig.correlation && !this.matchesCorrelation(payload, listenerConfig.correlation)) {
      return listenerConfig.includeUnmatched === true
    }

    if (!this.passesFilters(payload)) {
      return listenerConfig.includeUnmatched === true
    }

    return true
  }

  private matchesCorrelation(
    payload: Record<string, unknown>,
    correlation: NonNullable<ListenerConfig['correlation']>
  ): boolean {
    const receivedValue = evaluateJsonPath(payload, correlation.receivedPath)

    let expectedValue: unknown

    if (correlation.strategy === 'static') {
      expectedValue = correlation.value
    } else {
      // fromSentEvent strategy
      if (
        !correlation.sentEventId ||
        !correlation.sentPath ||
        !this.options.getSentEventPayload
      ) {
        return true
      }
      const sentPayload = this.options.getSentEventPayload(correlation.sentEventId)
      if (!sentPayload) return true
      expectedValue = evaluateJsonPath(sentPayload, correlation.sentPath)
    }

    if (correlation.caseSensitive === false) {
      const rv =
        typeof receivedValue === 'string' ? receivedValue.toLowerCase() : receivedValue
      const ev =
        typeof expectedValue === 'string' ? expectedValue.toLowerCase() : expectedValue
      return rv === ev
    }

    return receivedValue === expectedValue
  }

  private passesFilters(payload: Record<string, unknown>): boolean {
    const { listenerConfig } = this.options

    if (!listenerConfig.filters?.length) return true

    const enabledFilters = listenerConfig.filters.filter((f) => f.enabled !== false)
    if (!enabledFilters.length) return true

    const results = enabledFilters.map((f) => this.evaluateFilter(f, payload))
    const mode = listenerConfig.filterMode ?? 'all'
    return mode === 'all' ? results.every((r) => r) : results.some((r) => r)
  }

  private evaluateFilter(filter: ListenerFilter, payload: Record<string, unknown>): boolean {
    if (filter.type === 'jsonpath') {
      return this.evaluateJsonPathFilter(filter.config as JsonPathFilterConfig, payload)
    }
    return this.evaluateRegexFilter(filter.config as RegexFilterConfig, payload)
  }

  private evaluateJsonPathFilter(
    config: JsonPathFilterConfig,
    payload: Record<string, unknown>
  ): boolean {
    const value = evaluateJsonPath(payload, config.path)

    switch (config.operator) {
      case 'exists':
        return value !== undefined
      case 'equals':
        return value === config.value
      case 'notEquals':
        return value !== config.value
      case 'contains':
        if (Array.isArray(value)) return value.includes(config.value)
        if (typeof value === 'string') return value.includes(String(config.value))
        return false
      default:
        return false
    }
  }

  private evaluateRegexFilter(
    config: RegexFilterConfig,
    payload: Record<string, unknown>
  ): boolean {
    let target: string
    if (config.targetPath) {
      const extracted = evaluateJsonPath(payload, config.targetPath)
      target = extracted !== undefined ? String(extracted) : ''
    } else {
      target = JSON.stringify(payload)
    }
    const regex = new RegExp(config.pattern, config.flags)
    return regex.test(target)
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
