import {Publisher} from "./publisher";
import {
    AwsOperationSettings,
    CloudOperationSettings,
    EventBridgeConfig,
    InputConfig,
    KinesisConfig,
    SqsConfig
} from "../../../shared/models";
import {KinesisPublisher} from "../../cloud/kinesis/kinesis-publisher";
import {SqsPublisher} from "../../cloud/sqs/sqs-publisher";
import {EventBridgePublisher} from "../../cloud/eventbridge/eventbridge-publisher";

export class PublisherFactory {

    create(config: InputConfig, cloud: CloudOperationSettings): Publisher {
        switch (config.type) {
            case 'kinesis':
                return new KinesisPublisher({
                    config: config.config as KinesisConfig,
                    aws: this.requireAws(cloud)
                })
            case 'sqs':
                return new SqsPublisher({
                    config: config.config as SqsConfig,
                    aws: this.requireAws(cloud)
                })
            case 'eventbridge':
                return new EventBridgePublisher({
                    config: config.config as EventBridgeConfig,
                    aws: this.requireAws(cloud)
                })
            default:
                throw new Error(`Unknown type "${config.type}"`)
        }
    }

    private requireAws(cloud: CloudOperationSettings): AwsOperationSettings {
        const profile = cloud.aws?.profile?.trim();
        if (!profile) {
            throw new Error('AWS profile is required. Set cloud.aws.profile before sending events.');
        }
        return {
            profile
        };
    }

}