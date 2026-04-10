import {
    JsonPathFilterConfig,
    ListenerConfig,
    ListenerFilter,
    RegexFilterConfig,
    SessionCorrelationFilterConfig
} from "@shared/models";
import {evaluateJsonPath} from "@main/util/json";
import {Message, MessageFilter} from "@main/services/listeners/listener";
import { SessionSentValueIndexService } from './session-sent-value-index.service';

export class JsonMessageFilter implements MessageFilter {

    constructor(
        private readonly config: JsonPathFilterConfig
    ) {}

    matches(message: Message): boolean {
        const value = evaluateJsonPath(message.data, this.config.path);

        switch (this.config.operator) {
            case 'exists':
                return value !== undefined
            case 'equals':
                return value === this.config.value
            case 'notEquals':
                return value !== this.config.value
            case 'contains':
                if (Array.isArray(value)) return value.includes(this.config.value)
                if (typeof value === 'string') return value.includes(String(this.config.value))
                return false
            default:
                return false
        }
    }

}

export class RegexMessageFilter implements MessageFilter {

    constructor(
        private readonly config: RegexFilterConfig
    ) {}

    matches(message: Message): boolean {
        let data = message.raw.data;
        if (this.config.targetPath) {
            const extracted = evaluateJsonPath(message.data, this.config.targetPath);
            if (extracted !== undefined) {
                data = String(extracted);
            }
        }

        const regex = new RegExp(this.config.pattern, this.config.flags);
        return regex.test(data);
    }

}

export class AggregateFilter implements MessageFilter {

    constructor(private readonly filters: MessageFilter[],
                private readonly config: ListenerConfig) {}

    matches(message: Message): boolean {
        if (this.filters.length === 0) {
            return this.config.includeUnmatched === true;
        }

        if (this.config.filterMode === 'any') {
            return this.filters.some(filter => filter.matches(message));
        }

        if (this.config.filterMode === 'all') {
            return this.filters.every(filter => filter.matches(message));
        }

        return this.config.includeUnmatched === true;
    }

}

export class SessionCorrelationMessageFilter implements MessageFilter {

    constructor(
        private readonly config: SessionCorrelationFilterConfig,
        private readonly listenerConfig: ListenerConfig,
        private readonly sentValueIndex: SessionSentValueIndexService
    ) {}

    matches(message: Message): boolean {
        const receivedValue = evaluateJsonPath(message.data, this.config.receivedPath);
        return this.sentValueIndex.hasSentValue(
            this.listenerConfig.systemId,
            this.listenerConfig.sessionId,
            this.config.sentPath,
            receivedValue
        );
    }

}

export class FilterFactory {

    constructor(private readonly sentValueIndex: SessionSentValueIndexService) {}

    create(config: ListenerFilter, listenerConfig: ListenerConfig): MessageFilter {
        switch (config.type) {
            case "jsonpath":
                return new JsonMessageFilter(config.config as JsonPathFilterConfig);
            case "regex":
                return new RegexMessageFilter(config.config as RegexFilterConfig);
            case "sessionCorrelation":
                return new SessionCorrelationMessageFilter(
                    config.config as SessionCorrelationFilterConfig,
                    listenerConfig,
                    this.sentValueIndex
                );
            default:
                throw new Error("Unknown event type: " + config.type);
        }
    }

}