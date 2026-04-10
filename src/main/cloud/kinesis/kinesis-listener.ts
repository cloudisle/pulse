import {
  KinesisClient,
  DescribeStreamCommand,
  DescribeStreamCommandOutput,
  GetShardIteratorCommand,
  GetShardIteratorCommandOutput,
  GetRecordsCommand,
  GetRecordsCommandOutput
} from '@aws-sdk/client-kinesis'
import type { KinesisConfig } from '@shared/models'
import {randomUUID} from "crypto";
import {Listener, MessageHandler} from "@main/services/listeners/listener";
import { buildAwsClientConfig, isAwsSessionExpiredError } from '@main/cloud/aws-client'
import { deaggregateSync } from 'aws-kinesis-agg'

type KinesisRecord = {
  Data?: Uint8Array | string
  SequenceNumber?: string
  PartitionKey?: string
}

export interface KinesisListenerOptions {
  config: KinesisConfig
  aws: {
    profile: string
  }
}

export class KinesisListener implements Listener {

  readonly id: string

  private stopped = false
  private client: KinesisClient

  constructor(
    private readonly options: KinesisListenerOptions,
  ) {
    this.id = randomUUID()
    this.client = this.createClient()
  }

  /**
   * Describes the stream to obtain shard IDs, emits `running` lifecycle event,
   * then starts the polling loop for each shard asynchronously.
   */
  async start(handler: MessageHandler): Promise<void> {
    const { config } = this.options

    const describeResult = await this.sendWithCredentialRefresh<DescribeStreamCommandOutput>((client) =>
      client.send(new DescribeStreamCommand({ StreamName: config.streamName }))
    )

    const shards = describeResult.StreamDescription?.Shards ?? []

    for (const shard of shards) {
      if (shard.ShardId) {
        this.pollShard(shard.ShardId, handler).catch(async (err: any) => {
          if (!this.stopped) {
            await handler.onError(this.id, {
              name: err.name ?? 'GenericKinesisError',
              message: err.message ?? String(err),
              stack: err.stack ?? '',
              metadata: {
                ShardId: shard.ShardId,
                StreamName: config.streamName
              },
              recoverable: false
            });
          }
        })
      }
    }
  }

  /** Signals the polling loop to stop. */
  async stop(): Promise<void> {
    this.stopped = true
    return Promise.resolve();
  }

  private async pollShard(shardId: string, handler: MessageHandler): Promise<void> {
    const { pollInterval = 1000 } = this.options.config

    let shardIterator = await this.getShardIterator(shardId)

    while (!this.stopped) {
      try {
        const result = await this.sendWithCredentialRefresh<GetRecordsCommandOutput>((client) =>
          client.send(new GetRecordsCommand({ ShardIterator: shardIterator, Limit: 100 }))
        )

        for (const record of result.Records ?? []) {
          for (const userRecord of this.deaggregateRecord(record as KinesisRecord)) {
            await this.processRecord(userRecord, handler)
          }
        }

        shardIterator = result.NextShardIterator ?? shardIterator

        if (!this.stopped) {
          await this.sleep(pollInterval)
        }
      } catch (err: unknown) {
        const errName = (err as { name?: string })?.name
        if (errName === 'ExpiredIteratorException') {
          await handler.onError(this.id, {
            name: errName,
            message: 'Shard iterator expired, re-acquiring',
            stack: (err as Error).stack ?? '',
            recoverable: true,
            metadata: {
              ShardId: shardId,
              StreamName: this.options.config.streamName
            }
          });
          shardIterator = await this.getShardIterator(shardId)
        } else {
          throw err
        }
      }
    }
  }

  private async getShardIterator(shardId: string): Promise<string> {
    const result = await this.sendWithCredentialRefresh<GetShardIteratorCommandOutput>((client) =>
      client.send(new GetShardIteratorCommand({
        StreamName: this.options.config.streamName,
        ShardId: shardId,
        ShardIteratorType: 'LATEST'
      }))
    )

    if (!result.ShardIterator) {
      throw new Error(`Failed to get shard iterator for shard ${shardId}`)
    }

    return result.ShardIterator
  }

  private deaggregateRecord(record: KinesisRecord): KinesisRecord[] {
    let deaggregationError: Error | null = null
    let deaggregatedRecords: KinesisRecord[] | undefined

    deaggregateSync(record as never, false, (err, userRecords) => {
      if (err) {
        deaggregationError = err
        return
      }

      deaggregatedRecords = (userRecords as unknown as KinesisRecord[]) ?? [record]
    })

    if (deaggregationError || !deaggregatedRecords || deaggregatedRecords.length === 0) {
      return [record]
    }

    return deaggregatedRecords
  }

  private async processRecord(record: KinesisRecord, handler: MessageHandler): Promise<void> {
    if (!record.Data) return

    const dataBuffer =
      typeof record.Data === 'string'
        ? Buffer.from(record.Data, 'base64')
        : Buffer.from(record.Data)
    const message = dataBuffer.toString('utf-8')

    await handler.handle(this.id, {
      data: message,
      metadata: {
        sequenceNumber: record.SequenceNumber,
        partitionKey: record.PartitionKey
      }
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private createClient(): KinesisClient {
    return new KinesisClient({
      region: this.options.config.region,
      ...buildAwsClientConfig(this.options.aws.profile)
    })
  }

  private async sendWithCredentialRefresh<T>(execute: (client: KinesisClient) => Promise<T>): Promise<T> {
    try {
      return await execute(this.client)
    } catch (error) {
      if (!isAwsSessionExpiredError(error)) {
        throw error
      }

      this.client = this.createClient()
      return await execute(this.client)
    }
  }

}
