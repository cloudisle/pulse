import {KinesisConfig} from "@shared/models";
import {Publisher} from "@main/services/publishers/publisher";
import {randomUUID} from "crypto";
import {KinesisClient, PutRecordCommand, PutRecordCommandOutput} from "@aws-sdk/client-kinesis";
import { buildAwsClientConfig, isAwsSessionExpiredError } from '@main/cloud/aws-client'

export interface KinesisPublisherOptions {
    config: KinesisConfig;
    aws: {
        profile: string;
    };
}

export class KinesisPublisher implements Publisher {

    readonly id: string;

    private client: KinesisClient;

    constructor(
        private readonly options: KinesisPublisherOptions
    ) {
        this.id = randomUUID();
        this.client = this.createClient()
    }

    async publish(event: any) {
        const id = randomUUID();
        const StreamName = this.options.config.streamName;
        const result = await this.sendWithCredentialRefresh<PutRecordCommandOutput>((client) =>
            client.send(new PutRecordCommand({
                StreamName,
                Data: Buffer.from(event),
                PartitionKey: id
            }))
        );
        return {
            id,
            StreamName,
            SequenceNumber: result.SequenceNumber,
            ShardId: result.ShardId
        }
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