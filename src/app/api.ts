import {BrowserWindow, IpcMain, IpcRenderer} from "electron";

export function api<T>(o: T): T {
    o['__type'] = "api";
    return o as T & { __type: string };
}

export interface InitContext {
    main: IpcMain
    window: BrowserWindow
}

export interface RenderContext {
    renderer: IpcRenderer
}

export function initialize(identifier: string, api: any, context: InitContext) {
    const { main, window } = context;

    Object.getOwnPropertyNames(Object.getPrototypeOf(api))
        .filter((key) => typeof api[key] === 'function' && key !== 'constructor')
        .forEach((method) => {
            if (typeof api['setBrowserWindow'] === 'function') {
                api.setBrowserWindow(window);
            }

            if (typeof api['initialize'] === 'function') {
                api.initialize();
            }

            main.handle(`${identifier}.${method}`, (_e, ...args) => {
                console.debug(`Handling ${identifier}.${method}: ${JSON.stringify(args)}`);
                return api[method](...args)
            })
        });

    return api;
}

export function expose(identifier: string, api: any, context: RenderContext) {
    const { renderer } = context;

    const obj = {};

    Object.getOwnPropertyNames(Object.getPrototypeOf(api))
        .filter((key) => typeof api[key] === 'function' && key !== 'constructor')
        .forEach((method) => {
            obj[method] = (...args: any[]) => renderer.invoke(`${identifier}.${method}`, ...args)
        });

    return obj;
}