import {BrowserWindow, IpcRenderer, IpcRendererEvent} from "electron";
import {randomUUID} from "crypto";

export type ChannelListener<T> = (event: T) => Promise<void>
export type Handle = () => void

export interface Channel<T> {

    send(event: T): Promise<void>;
    listen(listener: ChannelListener<T>): Handle

}

export function channel<T>(): Channel<T> {
    return {
        __type: "channel",
        send: () => {},
        listen: () => () => {}
    } as any as Channel<T>;
}

export class RendererChannel<T> implements Channel<T> {

    constructor(
        private readonly name: string,
        private readonly renderer: IpcRenderer
    ) {}

    async send(event: T) {
        console.debug(`Sending event to ${this.name}: ${JSON.stringify(event)}`);

        this.renderer.send(this.name, event);
        await this.renderer.invoke('channelSendEvent', this.name, event);
    }

    listen(listener: ChannelListener<T>): Handle {
        const handler = async (_e: IpcRendererEvent, data: T) => await listener(data);
        this.renderer.on(this.name, handler);
        return () => this.renderer.removeListener(this.name, handler);
    }

}

export class MainChannel<T> implements Channel<T> {

    private readonly listeners: Record<string, ChannelListener<T>> = {}

    constructor(
        private readonly name: string,
        private readonly window: BrowserWindow
    ) {}

    async send(event: T) {
        console.debug(`Sending event to ${this.name}: ${JSON.stringify(event)}`);

        for (const id in Object.keys(this.listeners)) {
            try {
                await this.listeners[id](event);
            } catch (e) {
                console.error("Unhandled error for listener", id, e);
            }
        }

        this.window.webContents.send(this.name, event);
    }

    listen(listener: ChannelListener<T>): Handle {
        const id = randomUUID();
        this.listeners[id] = listener;
        return () => delete this.listeners[id];
    }

}