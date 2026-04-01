import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../../../src/app'
import type { ListenerConfig } from '../../../../src/shared/models'
import {
  DefaultMessageHandler,
  type MessageConverter,
  type MessageFilter,
  type RawMessage
} from '../../../../src/main/services/listeners/listener'

function makeConfig(overrides: Partial<ListenerConfig> = {}): ListenerConfig {
  return {
    systemId: 'sys-1',
    outputId: 'out-1',
    sessionId: 'session-1',
    cloud: {},
    ...overrides
  }
}

describe('DefaultMessageHandler', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('adds a received event to the session and emits listener data', async () => {
    const config = makeConfig()
    const filter: MessageFilter = { matches: vi.fn().mockReturnValue(true) }
    const converter: MessageConverter = {
      convert: vi.fn((raw: RawMessage) => ({ raw, data: { orderId: 'ord-1' } }))
    }

    const handler = new DefaultMessageHandler(config, filter, converter)
    const raw: RawMessage = {
      data: '{"orderId":"ord-1"}',
      headers: { traceId: 'trace-1' },
      metadata: { source: 'kinesis' }
    }

    await handler.handle('listener-1', raw)

    expect(App.api.sessions.addEvent).toHaveBeenCalledTimes(1)
    const [systemId, sessionId, sessionEvent] = (App.api.sessions.addEvent as any).mock.calls[0]

    expect(systemId).toBe('sys-1')
    expect(sessionId).toBe('session-1')
    expect(sessionEvent).toEqual(
      expect.objectContaining({
        listenerId: 'listener-1',
        sessionId: 'session-1',
        outputId: 'out-1',
        direction: 'received',
        payload: raw.data,
        status: 'success',
        metadata: { traceId: 'trace-1', source: 'kinesis' }
      })
    )

    expect(App.channels.listeners.data.send).toHaveBeenCalledWith({
      listenerId: 'listener-1',
      sessionId: 'session-1',
      event: sessionEvent
    })
  })

  it('does not add an event when filter does not match', async () => {
    const config = makeConfig()
    const filter: MessageFilter = { matches: vi.fn().mockReturnValue(false) }
    const converter: MessageConverter = {
      convert: vi.fn((raw: RawMessage) => ({ raw, data: {} }))
    }

    const handler = new DefaultMessageHandler(config, filter, converter)

    await handler.handle('listener-1', { data: '{}' })

    expect(App.api.sessions.addEvent).not.toHaveBeenCalled()
    expect(App.channels.listeners.data.send).not.toHaveBeenCalled()
  })
})

