import { describe, it, expect, vi } from 'vitest'
import { api, expose, initialize } from '../../../../src/app/api'

class SampleApi {
  setBrowserWindow(_window: unknown): void {}

  initialize(): void {}

  async getItem(id: string, _event: unknown) {
    return { id }
  }

  async createItem(data: object, _event: unknown) {
    return data
  }
}

describe('app/api helpers', () => {
  it('marks API objects with __type', () => {
    const service = api(new SampleApi())
    expect(service.__type).toBe('api')
  })

  it('registers ipcMain handlers using the provided identifier and method names', () => {
    const service = api(new SampleApi())
    const main = { handle: vi.fn() }

    initialize('api.sample', service, { main: main as any, window: {} as any })

    expect(main.handle).toHaveBeenCalledWith('api.sample.getItem', expect.any(Function))
    expect(main.handle).toHaveBeenCalledWith('api.sample.createItem', expect.any(Function))
  })

  it('registered handler calls the API method with args + invoke event', async () => {
    const service = api(new SampleApi())
    const spy = vi.spyOn(service, 'getItem')
    const main = { handle: vi.fn() }

    initialize('api.sample', service, { main: main as any, window: {} as any })

    const handler = main.handle.mock.calls.find((c) => c[0] === 'api.sample.getItem')?.[1]
    const invokeEvent = { sender: {} }
    await handler(invokeEvent, '123')

    expect(spy).toHaveBeenCalledWith('123', invokeEvent)
  })

  it('expose creates invoke proxies for API methods', async () => {
    const service = api(new SampleApi())
    const renderer = { invoke: vi.fn().mockResolvedValue({ id: '456' }) }

    const exposed = expose('api.sample', service, { renderer: renderer as any }) as any
    const result = await exposed.getItem('456')

    expect(renderer.invoke).toHaveBeenCalledWith('api.sample.getItem', '456')
    expect(result).toEqual({ id: '456' })
  })
})
