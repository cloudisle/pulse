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

    static instance: App<any>|null;

    private initialized = false;
    private exposed = false;

    private constructor(
        private readonly config: T,
    ) {}

    public initialize(main: IpcMain, window: BrowserWindow): T {
        if (this.initialized) {
            throw new Error("App already initialized");
        }

        console.debug("Initializing App");

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

        main.handle('channelSendEvent', async (_e, name: string, event: any) => {
            console.debug(`Handling channelSendEvent for channel ${name} with event:`, event);

            // convert name from dot notation to access channel object from App.channels
            const channel = name.split('.').reduce((obj, key) => obj[key], this.config);
            if (channel && typeof channel['send'] === 'function') {
                await (channel as unknown as Channel<any>).send(event);
            } else {
                return Promise.reject(`No channel found for name ${name}`);
            }
        });

        this.initialized = true;

        return this.config;
    }

    public expose(renderer: IpcRenderer): T {
        if (this.exposed) {
            throw new Error("App already exposed");
        }

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

        this.exposed = true;

        return this.config;
    }

    public get api(): T['apis'] {
        return this.config.apis;
    }

    public get channels(): T['channels'] {
        return this.config.channels;
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

    public static create<T extends AppConfig>(config: T): App<T> {
        if (App.instance) {
            throw new Error('App instance already exists');
        }

        App.instance = new App(config);

        return App.instance;
    }

}

export function app<T extends AppConfig>(config: T): App<T> {
    if (App.instance) {
        return App.instance;
    }

    return App.create(config);
}

export { api } from './api'
export { channel } from './channel'