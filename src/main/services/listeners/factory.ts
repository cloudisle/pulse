import {
    AwsOperationSettings,
    CloudOperationSettings,
    type KinesisConfig,
    ListenerConfig,
    OutputConfig
} from "../../../shared/models";
import {KinesisListener} from "../../cloud/kinesis/kinesis-listener";
import {ConverterFactory} from "./converter";
import {AggregateFilter, FilterFactory} from "./filter";
import {DefaultListenerLifecycle, DefaultMessageHandler, Listener, ListenerLifecycle} from "./listener";

export class ListenerFactory {

    create(config: OutputConfig, cloud: CloudOperationSettings): Listener {
        switch (config.type) {
            case 'kinesis':
                return new KinesisListener({
                    config: config.config as KinesisConfig,
                    aws: this.requireAws(cloud)
                });
            default:
                throw new Error(`Unsupported listener type: ${config.type}`)
        }
    }

    private requireAws(cloud: CloudOperationSettings): AwsOperationSettings {
        const profile = cloud.aws?.profile?.trim();
        if (!profile) {
            throw new Error('AWS profile is required. Set cloud.aws.profile before starting listeners.');
        }
        return {
            profile
        };
    }

}

export interface ListenerLifecycleConfig {
    listenerConfig: ListenerConfig;
    outputConfig: OutputConfig;
}

export class ListenerLifecycleFactory {

    constructor(
        private readonly listenerFactory: ListenerFactory,
        private readonly converterFactory: ConverterFactory,
        private readonly filterFactory: FilterFactory,
    ) {}

    async create(config: ListenerLifecycleConfig): Promise<ListenerLifecycle> {
        const { listenerConfig, outputConfig } = config;

        const converter = this.converterFactory.create(outputConfig.contentType);
        const filter = this.createAggregateFilter(listenerConfig);
        const listener = this.listenerFactory.create(outputConfig, listenerConfig.cloud);

        const handler = new DefaultMessageHandler(listenerConfig, filter, converter);

        return new DefaultListenerLifecycle(listener, listenerConfig, handler);
    }

    private createAggregateFilter(config: ListenerConfig) {
        const filters = (config.filters ?? []).map(f => this.filterFactory.create(f, config));

        return new AggregateFilter(filters, config);
    }

}