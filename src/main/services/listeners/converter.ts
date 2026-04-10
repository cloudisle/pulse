import {ContentType} from "@shared/models";
import {Message, MessageConverter, RawMessage} from "@main/services/listeners/listener";

export class JsonMessageConverter implements MessageConverter {

    convert(raw: RawMessage): Message {
        return {
            raw,
            data: JSON.parse(raw.data)
        }
    }

}

export class StringMessageConverter implements MessageConverter {

    convert(raw: RawMessage): Message {
        return {
            raw,
            data: { value: raw.data }
        }
    }

}

export class ConverterFactory {

    create(type: ContentType): MessageConverter {
        switch (type) {
            case "json":
                return new JsonMessageConverter();
            case "string":
                return new StringMessageConverter();
            default:
                throw new Error(`Unsupported content type: ${type}`);
        }
    }

}