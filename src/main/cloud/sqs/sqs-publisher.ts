import {Publisher} from "../../services/publishers/publisher";
import {randomUUID} from "crypto";
import {fromIni} from "@aws-sdk/credential-providers";
import {SqsConfig} from "../../../shared/models";
import {SendMessageCommand, SQSClient} from "@aws-sdk/client-sqs";

export interface SqsPublisherOptions {
    config: SqsConfig;
    aws: {
        profile: string;
    };
}

export class SqsPublisher implements Publisher {

    readonly id: string;

    private readonly client: SQSClient;

    constructor(
        private readonly options: SqsPublisherOptions
    ) {
        this.id = randomUUID();
        this.client = new SQSClient({
            region: options.config.region,
            credentials: fromIni({ profile: options.aws.profile })
        })
    }

    async publish(event: any) {
        const result = await this.client.send(
            new SendMessageCommand({
                QueueUrl: this.options.config.queueUrl,
                MessageBody: event
            })
        )
        return {
            id: result.MessageId ?? randomUUID(),
            MessageId: result.MessageId
        }
    }

}