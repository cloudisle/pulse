import {Channel, MainChannel, RendererChannel} from "./channel";
import {BrowserWindow, IpcMain, IpcRenderer} from "electron";
import {expose, initialize} from "./api";

export interface Channels {
    [key: string]: Channel<unknown> | Channels;
}

export interface Apis {
    [key: string]: object | Apis;
}

export interface AppConfig {
    apis: Apis;
    channels: Channels;
}

export type Configurer<T> = (key: string, value: T) => T

export interface ConfigureContext {
    configurer: Configurer<any>
    predicate: (o: any) => boolean
}

export class App<T extends AppConfig> {

    constructor(
        private readonly config: T,
    ) {}

    public initialize(main: IpcMain, window: BrowserWindow): T {
        this.configure('api', this.config.apis, {
            predicate: (o: any) => o['__type'] === 'api',
            configurer: (name: string, value: any) => initialize(name, value, {
                main, window
            })
        });

        this.configure('channels', this.config.channels, {
            predicate: (o: any) => o['__type'] === 'channel',
            configurer: (name: string) => new MainChannel(name, window)
        });

        return this.config;
    }

    public expose(renderer: IpcRenderer): T {
        this.configure('api', this.config.apis, {
            predicate: (o: any) => o['__type'] === 'api',
            configurer: (name: string, value: any) => expose(name, value, {
                renderer
            })
        });

        this.configure('channels', this.config.channels, {
            predicate: (o: any) => o['__type'] === 'channel',
            configurer: (name: string) => new RendererChannel(name, renderer)
        });

        return this.config;
    }

    private configure(name: string, data: any|Record<string, any>, context: ConfigureContext) {
        const { configurer, predicate } = context;
        Object.keys(data).forEach(key => {
            const identifier = `${name}.${key}`;
            const value = data[key];

            if (predicate(value)) {
                data[key] = configurer(identifier, value);
                return;
            }
            else if (typeof value === 'object') {
                this.configure(identifier, value, context);
            }
            else {
                throw new Error(`Initialization Error. ${identifier} must be an object or record`);
            }
        })
    }

}

export function app<T extends AppConfig>(config: T): App<T> {
    return new App(config);
}

export { api } from './api'
export { channel } from './channel'