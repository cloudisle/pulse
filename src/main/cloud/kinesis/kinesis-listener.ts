import {
  KinesisClient,
  DescribeStreamCommand,
  GetShardIteratorCommand,
  GetRecordsCommand
} from '@aws-sdk/client-kinesis'
import { fromIni } from '@aws-sdk/credential-providers'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import http from 'http'
import type { KinesisConfig } from '../../../shared/models'
import {randomUUID} from "crypto";
import {Listener, MessageHandler} from "../../services/listeners/listener";

export interface KinesisListenerOptions {
  config: KinesisConfig
  aws: {
    profile: string
  }
}

export class KinesisListener implements Listener {

  readonly id: string

  private stopped = false
  private readonly client: KinesisClient

  constructor(
    private readonly options: KinesisListenerOptions,
  ) {
    this.id = randomUUID()
    const endpointUrl = process.env.AWS_ENDPOINT_URL;
    this.client = new KinesisClient({
      region: options.config.region,
      credentials: fromIni({ profile: options.aws.profile }),
      ...(endpointUrl ? {
        endpoint: endpointUrl,
        requestHandler: new NodeHttpHandler({ httpAgent: new http.Agent({ keepAlive: false }) })
      } : {})
    })
  }

  /**
   * Describes the stream to obtain shard IDs, emits `running` lifecycle event,
   * then starts the polling loop for each shard asynchronously.
   */
  async start(handler: MessageHandler): Promise<void> {
    const { config } = this.options

    const describeResult = await this.client.send(
      new DescribeStreamCommand({ StreamName: config.streamName })
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
                shardId: shard.ShardId
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
        const result = await this.client.send(
          new GetRecordsCommand({ ShardIterator: shardIterator, Limit: 100 })
        )

        for (const record of result.Records ?? []) {
          await this.processRecord(record, handler)
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
            metadata: { shardId }
          });
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
        StreamName: this.options.config.streamName,
        ShardId: shardId,
        ShardIteratorType: 'LATEST'
      })
    )

    if (!result.ShardIterator) {
      throw new Error(`Failed to get shard iterator for shard ${shardId}`)
    }

    return result.ShardIterator
  }

  private async processRecord(record: {
    Data?: Uint8Array
    SequenceNumber?: string
    PartitionKey?: string
  }, handler: MessageHandler): Promise<void> {
    if (!record.Data) return

    const message = Buffer.from(record.Data).toString('utf-8')

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

}
