import { describe, it, expect, vi } from 'vitest'
import { ApiRegistry } from '../../../../src/main/api/registry'
import type { Api } from '../../../../src/shared/api'

class SampleApi implements Api {
  readonly api = 'sample'

  async getItem(_event: any, id: string) {
    return { id }
  }

  async createItem(_event: any, data: object) {
    return data
  }
}

describe('ApiRegistry — initialize', () => {
  it('registers ipcMain handles for each method on the api', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockMain = { handle: vi.fn() }

    registry.initialize(mockMain as any)

    expect(mockMain.handle).toHaveBeenCalledWith('sample.getItem', expect.any(Function))
    expect(mockMain.handle).toHaveBeenCalledWith('sample.createItem', expect.any(Function))
  })

  it('does not register a handle for constructor', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockMain = { handle: vi.fn() }

    registry.initialize(mockMain as any)

    const channels = mockMain.handle.mock.calls.map((c) => c[0])
    expect(channels).not.toContain('sample.constructor')
  })

  it('channels are named <namespace>.<method>', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockMain = { handle: vi.fn() }

    registry.initialize(mockMain as any)

    const channels = mockMain.handle.mock.calls.map((c) => c[0])
    expect(channels.every((c: string) => c.startsWith('sample.'))).toBe(true)
  })

  it('handler invokes the api method with the event and forwarded args', async () => {
    const api = new SampleApi()
    const spy = vi.spyOn(api, 'getItem')
    const registry = new ApiRegistry(api)
    const mockMain = { handle: vi.fn() }

    registry.initialize(mockMain as any)

    const handler = mockMain.handle.mock.calls.find((c) => c[0] === 'sample.getItem')?.[1]
    const mockEvent = { sender: {} }
    await handler(mockEvent, '123')

    expect(spy).toHaveBeenCalledWith(mockEvent, '123')
  })

  it('registers handles for multiple api namespaces', () => {
    class OtherApi implements Api {
      readonly api = 'other'
      async doThing(_event: any) {
        return true
      }
    }

    const registry = new ApiRegistry(new SampleApi(), new OtherApi())
    const mockMain = { handle: vi.fn() }

    registry.initialize(mockMain as any)

    const channels = mockMain.handle.mock.calls.map((c) => c[0])
    expect(channels).toContain('sample.getItem')
    expect(channels).toContain('sample.createItem')
    expect(channels).toContain('other.doThing')
  })
})

describe('ApiRegistry — expose', () => {
  it('builds a proxy namespace for each api', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockRenderer = { invoke: vi.fn() }

    const exposed = registry.expose(mockRenderer as any, {})

    expect(exposed.sample).toBeDefined()
    expect(typeof exposed.sample).toBe('object')
  })

  it('creates a proxy function for each api method', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockRenderer = { invoke: vi.fn() }

    const exposed = registry.expose(mockRenderer as any, {})

    expect(typeof exposed.sample.getItem).toBe('function')
    expect(typeof exposed.sample.createItem).toBe('function')
  })

  it('proxy method calls renderer.invoke with correct channel and args', async () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockRenderer = { invoke: vi.fn().mockResolvedValue({ id: '456' }) }

    const exposed = registry.expose(mockRenderer as any, {})
    await exposed.sample.getItem('456')

    expect(mockRenderer.invoke).toHaveBeenCalledWith('sample.getItem', '456')
  })

  it('does not include constructor in proxy', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockRenderer = { invoke: vi.fn() }

    const exposed = registry.expose(mockRenderer as any, {})

    expect(Object.prototype.hasOwnProperty.call(exposed.sample, 'constructor')).toBe(false)
  })

  it('preserves existing properties on baseObj', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockRenderer = { invoke: vi.fn() }

    const exposed = registry.expose(mockRenderer as any, { platform: 'linux' })

    expect(exposed.platform).toBe('linux')
    expect(exposed.sample).toBeDefined()
  })

  it('returns the same baseObj reference', () => {
    const registry = new ApiRegistry(new SampleApi())
    const mockRenderer = { invoke: vi.fn() }
    const baseObj = { platform: 'darwin' }

    const exposed = registry.expose(mockRenderer as any, baseObj)

    expect(exposed).toBe(baseObj)
  })

  it('handles multiple api namespaces', () => {
    class OtherApi implements Api {
      readonly api = 'other'
      async doThing(_event: any) {
        return true
      }
    }

    const registry = new ApiRegistry(new SampleApi(), new OtherApi())
    const mockRenderer = { invoke: vi.fn() }

    const exposed = registry.expose(mockRenderer as any, {})

    expect(typeof exposed.sample.getItem).toBe('function')
    expect(typeof exposed.other.doThing).toBe('function')
  })
})
