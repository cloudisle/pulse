import {Publisher} from "@main/services/publishers/publisher";
import {randomUUID} from "crypto";
import {EventBridgeClient, PutEventsCommand, PutEventsCommandOutput} from "@aws-sdk/client-eventbridge";
import {EventBridgeConfig} from "@shared/models";
import { buildAwsClientConfig, isAwsSessionExpiredError } from '@main/cloud/aws-client'

export interface EventBridgePublisherOptions {
    config: EventBridgeConfig;
    aws: {
        profile: string;
    };
}

export class EventBridgePublisher implements Publisher {

    readonly id: string;

    private client: EventBridgeClient;

    constructor(
        private readonly options: EventBridgePublisherOptions
    ) {
        this.id = randomUUID();
        this.client = this.createClient()
    }

    async publish(event: any) {
        const result = await this.sendWithCredentialRefresh<PutEventsCommandOutput>((client) =>
            client.send(new PutEventsCommand({
                Entries: [
                    {
                        EventBusName: this.options.config.eventBusName,
                        Source: this.options.config.source,
                        DetailType: this.options.config.detailType,
                        Detail: event
                    }
                ]
            }))
        )
        const entry = result.Entries?.[0]
        return {
            id: entry?.EventId ?? randomUUID(),
            EventId: entry?.EventId
        }
    }

    private createClient(): EventBridgeClient {
        return new EventBridgeClient({
            region: this.options.config.region,
            ...buildAwsClientConfig(this.options.aws.profile)
        })
    }

    private async sendWithCredentialRefresh<T>(execute: (client: EventBridgeClient) => Promise<T>): Promise<T> {
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