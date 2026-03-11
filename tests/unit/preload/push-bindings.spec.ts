import { describe, it, expect, vi } from 'vitest'
import { createPushBindings } from '../../../src/preload/push-bindings'
import type { IpcRenderer, IpcRendererEvent } from 'electron'

function makeMockRenderer(): IpcRenderer {
  return {
    on: vi.fn(),
    removeListener: vi.fn()
  } as unknown as IpcRenderer
}

describe('createPushBindings', () => {
  describe('listeners.onLifecycle', () => {
    it('registers an ipcRenderer.on listener for listeners:lifecycle', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      bindings.listeners.onLifecycle(vi.fn())

      expect(renderer.on).toHaveBeenCalledWith('listeners:lifecycle', expect.any(Function))
    })

    it('invokes the callback with the event data when a message arrives', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)
      const callback = vi.fn()

      bindings.listeners.onLifecycle(callback)

      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1] as Function
      const payload = { listenerId: 'l1', state: 'running', timestamp: 't' }
      registeredHandler({} as IpcRendererEvent, payload)

      expect(callback).toHaveBeenCalledWith(payload)
    })

    it('returns an unsubscribe function that calls removeListener', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      const unsubscribe = bindings.listeners.onLifecycle(vi.fn())
      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1]

      unsubscribe()

      expect(renderer.removeListener).toHaveBeenCalledWith('listeners:lifecycle', registeredHandler)
    })
  })

  describe('listeners.onData', () => {
    it('registers an ipcRenderer.on listener for listeners:data', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      bindings.listeners.onData(vi.fn())

      expect(renderer.on).toHaveBeenCalledWith('listeners:data', expect.any(Function))
    })

    it('invokes the callback with the event data when a message arrives', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)
      const callback = vi.fn()

      bindings.listeners.onData(callback)

      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1] as Function
      const payload = { listenerId: 'l1', sessionId: 's1', event: { id: 'e1' } }
      registeredHandler({} as IpcRendererEvent, payload)

      expect(callback).toHaveBeenCalledWith(payload)
    })

    it('returns an unsubscribe function that calls removeListener', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      const unsubscribe = bindings.listeners.onData(vi.fn())
      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1]

      unsubscribe()

      expect(renderer.removeListener).toHaveBeenCalledWith('listeners:data', registeredHandler)
    })
  })

  describe('listeners.onError', () => {
    it('registers an ipcRenderer.on listener for listeners:error', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      bindings.listeners.onError(vi.fn())

      expect(renderer.on).toHaveBeenCalledWith('listeners:error', expect.any(Function))
    })

    it('invokes the callback with the event data when a message arrives', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)
      const callback = vi.fn()

      bindings.listeners.onError(callback)

      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1] as Function
      const payload = { listenerId: 'l1', error: 'failed', timestamp: 't' }
      registeredHandler({} as IpcRendererEvent, payload)

      expect(callback).toHaveBeenCalledWith(payload)
    })

    it('returns an unsubscribe function that calls removeListener', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      const unsubscribe = bindings.listeners.onError(vi.fn())
      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1]

      unsubscribe()

      expect(renderer.removeListener).toHaveBeenCalledWith('listeners:error', registeredHandler)
    })
  })

  describe('log.onEntry', () => {
    it('registers an ipcRenderer.on listener for log:entry', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      bindings.log.onEntry(vi.fn())

      expect(renderer.on).toHaveBeenCalledWith('log:entry', expect.any(Function))
    })

    it('invokes the callback with the log entry when a message arrives', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)
      const callback = vi.fn()

      bindings.log.onEntry(callback)

      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1] as Function
      const payload = { id: 'log-1', timestamp: 't', level: 'info', source: 'app', message: 'hello' }
      registeredHandler({} as IpcRendererEvent, payload)

      expect(callback).toHaveBeenCalledWith(payload)
    })

    it('returns an unsubscribe function that calls removeListener', () => {
      const renderer = makeMockRenderer()
      const bindings = createPushBindings(renderer)

      const unsubscribe = bindings.log.onEntry(vi.fn())
      const registeredHandler = vi.mocked(renderer.on).mock.calls[0][1]

      unsubscribe()

      expect(renderer.removeListener).toHaveBeenCalledWith('log:entry', registeredHandler)
    })
  })
})
