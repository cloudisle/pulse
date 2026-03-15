import {
    JsonPathFilterConfig,
    ListenerConfig,
    ListenerFilter,
    RegexFilterConfig
} from "../../../shared/models";
import {evaluateJsonPath} from "../../util/json";
import {Message, MessageFilter} from "./listener";

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

export class FilterFactory {

    create(config: ListenerFilter): MessageFilter {
        switch (config.type) {
            case "jsonpath":
                return new JsonMessageFilter(config.config as JsonPathFilterConfig);
            case "regex":
                return new RegexMessageFilter(config.config as RegexFilterConfig);
            default:
                throw new Error("Unknown event type: " + config.type);
        }
    }

}