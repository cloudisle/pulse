import {ListenerConfig, ListenerLifecycleState, SessionEvent} from "../../../shared/models";
import {PushService} from "../push.service";
import {randomUUID} from "crypto";
import type { LogService } from "../log.service";

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
    handle(listenerId: string, message: RawMessage): void;
    onError(listenerId: string, error: any): void;
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

    constructor(
        private readonly config: ListenerConfig,
        private readonly channel: PushService,
        private readonly filter: MessageFilter,
        private readonly converter: MessageConverter,
        private readonly logger?: LogService,
    ) {
    }

    handle(listenerId: string, raw: RawMessage): void {
        const message = this.converter.convert(raw);

        if (!this.filter.matches(message)) {
            return;
        }

        void this.logger?.debug(
            'listeners',
            `Listener ${listenerId} data received`,
            { sessionId: this.config.sessionId }
        )

        const sessionEvent: SessionEvent = {
            id: randomUUID(),
            listenerId: listenerId,
            sessionId: this.config.sessionId,
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

        this.channel.sendListenerData({
            listenerId,
            sessionId: this.config.sessionId,
            event: sessionEvent
        })
    }

    onError(listenerId: string, error: any): void {
        void this.logger?.error(
            'listeners',
            `Listener ${listenerId} error: ${error.message}`,
            {
                sessionId: this.config.sessionId,
                metadata: { recoverable: error.recoverable ?? false }
            }
        )

        this.channel.sendListenerError({
            listenerId,
            error: error.message,
            timestamp: new Date().toISOString(),
            recoverable: error.recoverable ?? false
        });
    }

}

export class DefaultListenerLifecycle implements ListenerLifecycle {

    private _state: ListenerLifecycleState;

    constructor(
        readonly listener: Listener,
        readonly config: ListenerConfig,
        private readonly handler: MessageHandler,
        private readonly channel: PushService,
        private readonly logger?: LogService,
    ) {
        this._state = 'stopped';
    }

    async start() {
        this.state = 'starting';

        try {
            await this.listener.start(this.handler);
        } catch (error: any) {
            await this.stop();
            this.state = 'error';
        }

        this.state = 'running';
    }

    async stop() {
        this.state = 'stopping';

        await this.listener.stop();

        this.state = 'stopped';
    }

    get state() {
        return this._state;
    }

    private set state(s: ListenerLifecycleState) {
        const previousState = this._state;

        this.channel.sendListenerLifecycle({
            listenerId: this.listener.id,
            outputId: this.config.outputId,
            sessionId: this.config.sessionId,
            previousState,
            state: s,
            timestamp: new Date().toISOString()
        });

        if (s === 'running') {
            void this.logger?.info(
                'listeners',
                `Listener ${this.listener.id} started`,
                { sessionId: this.config.sessionId }
            )
        } else if (s === 'stopped') {
            void this.logger?.info(
                'listeners',
                `Listener ${this.listener.id} stopped`,
                { sessionId: this.config.sessionId }
            )
        } else if (s === 'error') {
            void this.logger?.error(
                'listeners',
                `Listener ${this.listener.id} failed to start`,
                { sessionId: this.config.sessionId }
            )
        }

        this._state = s;
    }

}