import {CloudService} from "../cloud.service";
import {type KinesisConfig, ListenerConfig, OutputConfig} from "../../../shared/models";
import {KinesisListener} from "../../cloud/kinesis/kinesis-listener";
import {PushService} from "../push.service";
import {ConverterFactory} from "./converter";
import {AggregateFilter, FilterFactory} from "./filter";
import {DefaultListenerLifecycle, DefaultMessageHandler, Listener, ListenerLifecycle} from "./listener";

export class ListenerFactory {

    constructor(
        private readonly cloud: CloudService,
    ) {}

    create(config: OutputConfig): Listener {
        const awsProfile = this.cloud.get('aws', 'profile') as unknown as string;
        switch (config.type) {
            case 'kinesis':
                return new KinesisListener({
                    config: config.config as KinesisConfig,
                    awsProfile
                });
            default:
                throw new Error(`Unsupported listener type: ${config.type}`)
        }
    }

}

export interface ListenerLifecycleConfig {
    listenerConfig: ListenerConfig;
    outputConfig: OutputConfig;
}

export class ListenerLifecycleFactory {

    constructor(
        private readonly channel: PushService,
        private readonly listenerFactory: ListenerFactory,
        private readonly converterFactory: ConverterFactory,
        private readonly filterFactory: FilterFactory,
    ) {}

    async create(config: ListenerLifecycleConfig): Promise<ListenerLifecycle> {
        const { listenerConfig, outputConfig } = config;

        const converter = this.converterFactory.create(outputConfig.contentType);
        const filter = this.createAggregateFilter(listenerConfig);
        const listener = this.listenerFactory.create(outputConfig);

        const handler = new DefaultMessageHandler(listenerConfig, this.channel, filter, converter);

        return new DefaultListenerLifecycle(listener, listenerConfig, handler, this.channel);
    }

    private createAggregateFilter(config: ListenerConfig) {
        const filters = (config.filters ?? []).map(f => this.filterFactory.create(f));

        return new AggregateFilter(filters, config);
    }

}