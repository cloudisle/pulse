import { describe, it, expect, vi } from 'vitest'
import { PushService } from '../../../src/main/services/push.service'
import type {
  ListenerLifecycleEvent,
  ListenerDataEvent,
  ListenerErrorEvent
} from '../../../src/shared/models'
import type { LogEntry } from '../../../src/shared/models'

function makeMockWindow() {
  return {
    webContents: {
      send: vi.fn()
    }
  }
}

describe('PushService', () => {
  describe('sendListenerLifecycle', () => {
    it('calls webContents.send with listeners:lifecycle channel and event payload', () => {
      const mockWindow = makeMockWindow()
      const service = new PushService(mockWindow as any)

      const event: ListenerLifecycleEvent = {
        listenerId: 'listener-1',
        outputId: 'output-1',
        sessionId: 'session-1',
        state: 'running',
        timestamp: '2024-01-01T00:00:00.000Z'
      }

      service.sendListenerLifecycle(event)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('listeners:lifecycle', event)
    })

    it('forwards all fields of the lifecycle event', () => {
      const mockWindow = makeMockWindow()
      const service = new PushService(mockWindow as any)

      const event: ListenerLifecycleEvent = {
        listenerId: 'listener-2',
        outputId: 'output-2',
        sessionId: 'session-2',
        previousState: 'starting',
        state: 'error',
        timestamp: '2024-01-01T00:01:00.000Z',
        reason: 'fatal-error',
        error: 'Connection refused'
      }

      service.sendListenerLifecycle(event)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('listeners:lifecycle', event)
    })
  })

  describe('sendListenerData', () => {
    it('calls webContents.send with listeners:data channel and event payload', () => {
      const mockWindow = makeMockWindow()
      const service = new PushService(mockWindow as any)

      const event: ListenerDataEvent = {
        listenerId: 'listener-1',
        sessionId: 'session-1',
        event: {
          id: 'event-1',
          sessionId: 'session-1',
          direction: 'received',
          timestamp: '2024-01-01T00:00:00.000Z',
          payload: { key: 'value' },
          status: 'success'
        }
      }

      service.sendListenerData(event)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('listeners:data', event)
    })
  })

  describe('sendListenerError', () => {
    it('calls webContents.send with listeners:error channel and event payload', () => {
      const mockWindow = makeMockWindow()
      const service = new PushService(mockWindow as any)

      const event: ListenerErrorEvent = {
        listenerId: 'listener-1',
        error: 'Unexpected disconnect',
        timestamp: '2024-01-01T00:00:00.000Z',
        recoverable: false
      }

      service.sendListenerError(event)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('listeners:error', event)
    })
  })

  describe('sendLogEntry', () => {
    it('calls webContents.send with log:entry channel and log payload', () => {
      const mockWindow = makeMockWindow()
      const service = new PushService(mockWindow as any)

      const entry: LogEntry = {
        id: 'log-1',
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        source: 'listeners',
        message: 'Listener started'
      }

      service.sendLogEntry(entry)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('log:entry', entry)
    })

    it('forwards all optional fields of the log entry', () => {
      const mockWindow = makeMockWindow()
      const service = new PushService(mockWindow as any)

      const entry: LogEntry = {
        id: 'log-2',
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'error',
        source: 'aws',
        message: 'SDK error',
        sessionId: 'session-1',
        metadata: { code: 500 }
      }

      service.sendLogEntry(entry)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('log:entry', entry)
    })
  })
})
