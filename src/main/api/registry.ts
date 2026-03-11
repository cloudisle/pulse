import type { IpcMain, IpcRenderer } from 'electron'
import type { Api } from '../../shared/api'

export class ApiRegistry {
  private readonly apis: Record<string, Api>

  constructor(...apis: Api[]) {
    this.apis = apis.reduce(
      (acc, api) => {
        acc[api.api] = api
        return acc
      },
      {} as Record<string, Api>
    )
  }

  public initialize(main: IpcMain): void {
    for (const name in this.apis) {
      const api = this.apis[name] as any

      Object.getOwnPropertyNames(Object.getPrototypeOf(api))
        .filter((key) => typeof api[key] === 'function' && key !== 'constructor')
        .forEach((method) => {
          main.handle(`${name}.${method}`, (event, ...args) => {
            return api[method](event, ...args)
          })
        })
    }
  }

  public expose(renderer: IpcRenderer, baseObj: any): any {
    for (const name in this.apis) {
      baseObj[name] = {}

      const api = this.apis[name] as any

      Object.getOwnPropertyNames(Object.getPrototypeOf(api))
        .filter((key) => typeof api[key] === 'function' && key !== 'constructor')
        .forEach((method) => {
          baseObj[name][method] = (...args: any[]) =>
            renderer.invoke(`${name}.${method}`, ...args)
        })
    }

    return baseObj
  }
}
