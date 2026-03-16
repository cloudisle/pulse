import {KinesisConfig} from "../../../shared/models";
import {Publisher} from "../../services/publishers/publisher";
import {randomUUID} from "crypto";
import {KinesisClient, PutRecordCommand} from "@aws-sdk/client-kinesis";
import {fromIni} from "@aws-sdk/credential-providers";

export interface KinesisPublisherOptions {
    config: KinesisConfig;
    awsProfile: string;
}

export class KinesisPublisher implements Publisher {

    readonly id: string;

    private readonly client: KinesisClient;

    constructor(
        private readonly options: KinesisPublisherOptions
    ) {
        this.id = randomUUID();
        this.client = new KinesisClient({
            region: options.config.region,
            credentials: fromIni({ profile: options.awsProfile })
        })
    }

    async publish(event: any) {
        const id = randomUUID();
        const result = await this.client.send(
            new PutRecordCommand({
                StreamName: this.options.config.streamName,
                Data: Buffer.from(event),
                PartitionKey: id
            })
        );
        return {
            id,
            SequenceNumber: result.SequenceNumber,
            ShardId: result.ShardId
        }
    }

}