import {Publisher} from "./publisher";
import {EventBridgeConfig, InputConfig, KinesisConfig, SqsConfig} from "../../../shared/models";
import {KinesisPublisher} from "../../cloud/kinesis/kinesis-publisher";
import {SqsPublisher} from "../../cloud/sqs/sqs-publisher";
import {EventBridgePublisher} from "../../cloud/eventbridge/eventbridge-publisher";
import {CloudService} from "../cloud.service";

export class PublisherFactory {

    constructor(
        private readonly cloud: CloudService,
    ) {}

    create(config: InputConfig): Publisher {
        const awsProfile = this.cloud.get('aws', 'profile') as unknown as string;
        switch (config.type) {
            case 'kinesis':
                return new KinesisPublisher({
                    config: config.config as KinesisConfig,
                    awsProfile
                })
            case 'sqs':
                return new SqsPublisher({
                    config: config.config as SqsConfig,
                    awsProfile
                })
            case 'eventbridge':
                return new EventBridgePublisher({
                    config: config.config as EventBridgeConfig,
                    awsProfile
                })
            default:
                throw new Error(`Unknown type "${config.type}"`)
        }
    }

}