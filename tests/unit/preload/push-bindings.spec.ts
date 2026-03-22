import { describe, it, expect, vi } from 'vitest'
import { MainChannel, RendererChannel, channel } from '../../../src/app/channel'
import type { BrowserWindow, IpcRenderer, IpcRendererEvent } from 'electron'

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'listener-1')
}))

function makeMockRenderer(): IpcRenderer {
  return {
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn()
  } as unknown as IpcRenderer
}

function makeMockWindow(): BrowserWindow {
  return {
    webContents: {
      send: vi.fn()
    }
  } as unknown as BrowserWindow
}

describe('app/channel', () => {
  it('channel() marks config entries with __type="channel"', () => {
    const configured = channel<string>()
    expect(configured.__type).toBe('channel')
  })

  it('RendererChannel.listen subscribes and unsubscribe removes the listener', () => {
    const renderer = makeMockRenderer()
    const callback = vi.fn()
    const ch = new RendererChannel('channels.listeners.lifecycle', renderer)

    const unsubscribe = ch.listen(callback)
    const handler = vi.mocked(renderer.on).mock.calls[0][1] as Function
    handler({} as IpcRendererEvent, { state: 'running' })
    unsubscribe()

    expect(renderer.on).toHaveBeenCalledWith('channels.listeners.lifecycle', expect.any(Function))
    expect(callback).toHaveBeenCalledWith({ state: 'running' })
    expect(renderer.removeListener).toHaveBeenCalledWith('channels.listeners.lifecycle', handler)
  })

  it('RendererChannel.send dispatches over both send and invoke bridge calls', () => {
    const renderer = makeMockRenderer()
    const ch = new RendererChannel('channels.log.entry', renderer)

    ch.send({ message: 'hello' })

    expect(renderer.send).toHaveBeenCalledWith('channels.log.entry', { message: 'hello' })
    expect(renderer.invoke).toHaveBeenCalledWith('channelSendEvent', 'channels.log.entry', {
      message: 'hello'
    })
  })

  it('MainChannel.listen receives local sends and forwards to webContents', () => {
    const window = makeMockWindow()
    const callback = vi.fn()
    const ch = new MainChannel('channels.listeners.data', window)

    const unsubscribe = ch.listen(callback)
    ch.send({ eventId: 'evt-1' })
    unsubscribe()
    ch.send({ eventId: 'evt-2' })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({ eventId: 'evt-1' })
    expect(window.webContents.send).toHaveBeenCalledWith('channels.listeners.data', {
      eventId: 'evt-1'
    })
    expect(window.webContents.send).toHaveBeenCalledWith('channels.listeners.data', {
      eventId: 'evt-2'
    })
  })
})
