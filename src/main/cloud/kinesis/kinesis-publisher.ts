import {KinesisConfig} from "@shared/models";
import {Publisher} from "@main/services/publishers/publisher";
import {randomUUID} from "crypto";
import {KinesisClient, PutRecordCommand} from "@aws-sdk/client-kinesis";
import {fromIni} from "@aws-sdk/credential-providers";
import {NodeHttpHandler} from "@smithy/node-http-handler";
import http from "http";

export interface KinesisPublisherOptions {
    config: KinesisConfig;
    aws: {
        profile: string;
    };
}

export class KinesisPublisher implements Publisher {

    readonly id: string;

    private readonly client: KinesisClient;

    constructor(
        private readonly options: KinesisPublisherOptions
    ) {
        this.id = randomUUID();
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