import {Publisher} from "../../services/publishers/publisher";
import {randomUUID} from "crypto";
import {fromIni} from "@aws-sdk/credential-providers";
import {EventBridgeClient, PutEventsCommand} from "@aws-sdk/client-eventbridge";
import {EventBridgeConfig} from "../../../shared/models";

export interface EventBridgePublisherOptions {
    config: EventBridgeConfig;
    awsProfile: string;
}

export class EventBridgePublisher implements Publisher {

    readonly id: string;

    private readonly client: EventBridgeClient;

    constructor(
        private readonly options: EventBridgePublisherOptions
    ) {
        this.id = randomUUID();
        this.client = new EventBridgeClient({
            region: options.config.region,
            credentials: fromIni({ profile: options.awsProfile })
        })
    }

    async publish(event: any) {
        const result = await this.client.send(
            new PutEventsCommand({
                Entries: [
                    {
                        EventBusName: this.options.config.eventBusName,
                        Source: this.options.config.source,
                        DetailType: this.options.config.detailType,
                        Detail: event
                    }
                ]
            })
        )
        const entry = result.Entries?.[0]
        return {
            id: entry?.EventId ?? randomUUID(),
            EventId: entry?.EventId
        }
    }

}