import {ListenerConfig, ListenerLifecycleState, SessionEvent} from "../../../shared/models";
import {randomUUID} from "crypto";
import App from "../../../app";
import {logger} from "../../util/log";

export interface RawMessage {
    data: string;
    headers?: Record<string, any>;
    metadata?: Record<string, any>;
}

export interface Message {
    raw: RawMessage;
    data: Record<string, any>;
}

export interface MessageHandler {
    handle(listenerId: string, message: RawMessage): Promise<void>;
    onError(listenerId: string, error: any): Promise<void>;
}

export interface MessageConverter {
    convert(raw: RawMessage): Message;
}

export interface MessageFilter {
    matches(message: Message): boolean;
}

export interface ListenerError extends Error {
    recoverable?: boolean;
    metadata?: Record<string, string>;
}

export interface Listener {

    readonly id: string;
    start(handler: MessageHandler): Promise<void>;
    stop(): Promise<void>;

}

export interface ListenerLifecycle {

    readonly state: ListenerLifecycleState;
    readonly listener: Listener;
    start(): Promise<void>;
    stop(): Promise<void>;

}

export class DefaultMessageHandler implements MessageHandler {

    private static log = logger('DefaultMessageHandler');

    constructor(
        private readonly config: ListenerConfig,
        private readonly filter: MessageFilter,
        private readonly converter: MessageConverter
    ) {
    }

    async handle(listenerId: string, raw: RawMessage): Promise<void> {
        const sessionId = this.config.sessionId;
        const message = this.converter.convert(raw);

        if (!this.filter.matches(message)) {
            return;
        }

        await DefaultMessageHandler.log.debug(`Listener ${listenerId} data received`, { sessionId })

        const sessionEvent: SessionEvent = {
            id: randomUUID(),
            listenerId,
            sessionId,
            outputId: this.config.outputId,
            direction: 'received',
            timestamp: new Date().toISOString(),
            payload: message.raw.data,
            metadata: {
                ...message.raw.headers,
                ...message.raw.metadata
            },
            status: 'success',
        }

        await App.api.sessions.addEvent(this.config.systemId, sessionId, sessionEvent);

        await App.channels.listeners.data.send({
            listenerId,
            sessionId,
            event: sessionEvent
        });
    }

    async onError(listenerId: string, error: any): Promise<void> {
        await DefaultMessageHandler.log.error(`Listener ${listenerId} error: ${error.message}`, {
            sessionId: this.config.sessionId,
            recoverable: error.recoverable ?? false
        });

        await App.channels.listeners.error.send({
            listenerId,
            error: error.message,
            timestamp: new Date().toISOString(),
            recoverable: error.recoverable ?? false
        });
    }

}

export class DefaultListenerLifecycle implements ListenerLifecycle {

    private static log = logger('DefaultListenerLifecycle');

    private _state: ListenerLifecycleState;

    constructor(
        readonly listener: Listener,
        readonly config: ListenerConfig,
        private readonly handler: MessageHandler,
    ) {
        this._state = 'stopped';
    }

    async start() {
        await this.setState('starting');

        try {
            await this.listener.start(this.handler);
        } catch (error: any) {
            console.error("Error starting listener", error);
            await this.stop();
            await this.setState('error', error?.message ?? String(error));
            return;
        }

        await this.setState('running');
    }

    async stop() {
        await this.setState('stopping');

        await this.listener.stop();

        await this.setState('stopped');
    }

    get state() {
        return this._state;
    }

    private async setState(s: ListenerLifecycleState, error?: string) {
        const sessionId = this.config.sessionId;
        const previousState = this._state;

        await App.channels.listeners.lifecycle.send({
            listenerId: this.listener.id,
            outputId: this.config.outputId,
            sessionId,
            previousState,
            state: s,
            timestamp: new Date().toISOString(),
            error
        });

        const level = s === 'error' ? 'error' : 'info';
        let message = `Listener ${this.listener.id} state changed to ${s}`;

        if (error) {
            message += `: ${error}`;
        }

        await DefaultListenerLifecycle.log.log(level, message, { sessionId });

        this._state = s;
    }

}