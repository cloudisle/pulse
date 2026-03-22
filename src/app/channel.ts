import {BrowserWindow, IpcRenderer, IpcRendererEvent} from "electron";
import {randomUUID} from "crypto";

export type ChannelListener<T> = (event: T, ) => void
export type Handle = () => void

export interface Channel<T> {

    send(event: T): void;
    listen(listener: ChannelListener<T>): Handle

}

export function channel<T>(): Channel<T> & { __type: string } {
    return {
        __type: "channel",
        send: () => {},
        listen: () => () => {}
    }
}

export class RendererChannel<T> implements Channel<T> {

    constructor(
        private readonly name: string,
        private readonly renderer: IpcRenderer
    ) {}

    send(event: T) {
        this.renderer.send(this.name, event);
        this.renderer.invoke('channelSendEvent', this.name, event);
    }

    listen(listener: ChannelListener<T>): Handle {
        const handler = (_e: IpcRendererEvent, data: T) => listener(data);
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

    send(event: T) {
        Object.keys(this.listeners).forEach(id => {
            this.listeners[id](event);
        });

        this.window.webContents.send(this.name, event);
    }

    listen(listener: ChannelListener<T>): Handle {
        const id = randomUUID();
        this.listeners[id] = listener;
        return () => delete this.listeners[id];
    }

}