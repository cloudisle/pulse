import {Publisher} from "@main/services/publishers/publisher";
import {randomUUID} from "crypto";
import {SqsConfig} from "@shared/models";
import {SendMessageCommand, SendMessageCommandOutput, SQSClient} from "@aws-sdk/client-sqs";
import { buildAwsClientConfig, isAwsSessionExpiredError } from '@main/cloud/aws-client'

export interface SqsPublisherOptions {
    config: SqsConfig;
    aws: {
        profile: string;
    };
}

export class SqsPublisher implements Publisher {

    readonly id: string;

    private client: SQSClient;

    constructor(
        private readonly options: SqsPublisherOptions
    ) {
        this.id = randomUUID();
        this.client = this.createClient()
    }

    async publish(event: any) {
        const QueueUrl = this.options.config.queueUrl;
        const result = await this.sendWithCredentialRefresh<SendMessageCommandOutput>((client) =>
            client.send(new SendMessageCommand({
                QueueUrl,
                MessageBody: event
            }))
        )
        return {
            id: result.MessageId ?? randomUUID(),
            MessageId: result.MessageId,
            QueueUrl
        }
    }

    private createClient(): SQSClient {
        return new SQSClient({
            region: this.options.config.region,
            ...buildAwsClientConfig(this.options.aws.profile)
        })
    }

    private async sendWithCredentialRefresh<T>(execute: (client: SQSClient) => Promise<T>): Promise<T> {
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