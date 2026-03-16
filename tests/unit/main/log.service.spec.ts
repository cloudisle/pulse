import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LogService } from '../../../src/main/services/log.service'
import type { AppSettings } from '../../../src/shared/models'

const BASE_SETTINGS: AppSettings = {
  sessionHistoryLimit: 10,
  defaultRegion: 'us-east-1',
  theme: 'dark',
  dataDirectory: '/tmp/data',
  logLevel: 'info'
}

describe('LogService', () => {
  let settings: { getSettings: ReturnType<typeof vi.fn> }
  let sessions: { addLog: ReturnType<typeof vi.fn> }
  let push: { sendLogEntry: ReturnType<typeof vi.fn> }
  let service: LogService

  beforeEach(() => {
    settings = { getSettings: vi.fn().mockResolvedValue({ ...BASE_SETTINGS }) }
    sessions = { addLog: vi.fn().mockResolvedValue(undefined) }
    push = { sendLogEntry: vi.fn() }
    service = new LogService(settings as any, sessions as any, push as any)
  })

  describe('log level filtering', () => {
    it('emits debug logs when logLevel is debug', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'debug' })
      await service.debug('test', 'debug message')
      expect(push.sendLogEntry).toHaveBeenCalledTimes(1)
    })

    it('suppresses debug logs when logLevel is info', async () => {
      await service.debug('test', 'debug message')
      expect(push.sendLogEntry).not.toHaveBeenCalled()
    })

    it('emits info logs when logLevel is info', async () => {
      await service.info('test', 'info message')
      expect(push.sendLogEntry).toHaveBeenCalledTimes(1)
    })

    it('suppresses info logs when logLevel is warn', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'warn' })
      await service.info('test', 'info message')
      expect(push.sendLogEntry).not.toHaveBeenCalled()
    })

    it('emits warn logs when logLevel is warn', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'warn' })
      await service.warn('test', 'warn message')
      expect(push.sendLogEntry).toHaveBeenCalledTimes(1)
    })

    it('suppresses warn logs when logLevel is error', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'error' })
      await service.warn('test', 'warn message')
      expect(push.sendLogEntry).not.toHaveBeenCalled()
    })

    it('emits error logs when logLevel is error', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'error' })
      await service.error('test', 'error message')
      expect(push.sendLogEntry).toHaveBeenCalledTimes(1)
    })

    it('emits error logs at any configured level', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'debug' })
      await service.error('test', 'error message')
      expect(push.sendLogEntry).toHaveBeenCalledTimes(1)
    })

    it('emits all log levels when logLevel is debug', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'debug' })
      await service.debug('test', 'debug')
      await service.info('test', 'info')
      await service.warn('test', 'warn')
      await service.error('test', 'error')
      expect(push.sendLogEntry).toHaveBeenCalledTimes(4)
    })
  })

  describe('log entry structure', () => {
    it('creates a log entry with id, timestamp, level, source, and message', async () => {
      await service.info('events', 'Test message')

      expect(push.sendLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          timestamp: expect.any(String),
          level: 'info',
          source: 'events',
          message: 'Test message'
        })
      )
    })

    it('generates a unique UUID for each log entry', async () => {
      await service.info('test', 'message 1')
      await service.info('test', 'message 2')

      const [call1, call2] = push.sendLogEntry.mock.calls
      expect(call1[0].id).not.toBe(call2[0].id)
    })

    it('generates an ISO 8601 timestamp', async () => {
      await service.info('test', 'message')

      const entry = push.sendLogEntry.mock.calls[0][0]
      expect(() => new Date(entry.timestamp)).not.toThrow()
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('includes sessionId in the entry when provided', async () => {
      await service.info('events', 'Test', { sessionId: 'session-1', systemId: 'sys-1' })

      expect(push.sendLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' })
      )
    })

    it('includes metadata in the entry when provided', async () => {
      await service.info('events', 'Test', { metadata: { key: 'value' } })

      expect(push.sendLogEntry).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { key: 'value' } })
      )
    })

    it('omits sessionId from the entry when not provided', async () => {
      await service.info('events', 'Test')

      const entry = push.sendLogEntry.mock.calls[0][0]
      expect(entry.sessionId).toBeUndefined()
    })

    it('omits metadata from the entry when not provided', async () => {
      await service.info('events', 'Test')

      const entry = push.sendLogEntry.mock.calls[0][0]
      expect(entry.metadata).toBeUndefined()
    })
  })

  describe('session persistence', () => {
    it('persists log to session when systemId and sessionId are provided', async () => {
      await service.info('events', 'Test', { systemId: 'sys-1', sessionId: 'session-1' })

      expect(sessions.addLog).toHaveBeenCalledWith(
        'sys-1',
        'session-1',
        expect.objectContaining({ level: 'info', message: 'Test' })
      )
    })

    it('does not persist to session when sessionId is missing', async () => {
      await service.info('events', 'Test', { systemId: 'sys-1' })
      expect(sessions.addLog).not.toHaveBeenCalled()
    })

    it('does not persist to session when systemId is missing', async () => {
      await service.info('events', 'Test', { sessionId: 'session-1' })
      expect(sessions.addLog).not.toHaveBeenCalled()
    })

    it('does not persist to session when no context is provided', async () => {
      await service.info('events', 'Test')
      expect(sessions.addLog).not.toHaveBeenCalled()
    })

    it('still pushes to renderer if session persistence fails', async () => {
      sessions.addLog.mockRejectedValue(new Error('Storage error'))

      await service.info('events', 'Test', { systemId: 'sys-1', sessionId: 'session-1' })

      expect(push.sendLogEntry).toHaveBeenCalledTimes(1)
    })

    it('does not persist suppressed log levels to session', async () => {
      settings.getSettings.mockResolvedValue({ ...BASE_SETTINGS, logLevel: 'error' })

      await service.info('events', 'Test', { systemId: 'sys-1', sessionId: 'session-1' })

      expect(sessions.addLog).not.toHaveBeenCalled()
    })
  })

  describe('push emission', () => {
    it('always pushes each emitted log entry to the renderer', async () => {
      await service.info('events', 'Message 1')
      await service.warn('events', 'Message 2')
      await service.error('events', 'Message 3')

      expect(push.sendLogEntry).toHaveBeenCalledTimes(3)
    })

    it('pushes to renderer after session persistence', async () => {
      const callOrder: string[] = []
      sessions.addLog.mockImplementation(async () => {
        callOrder.push('persist')
      })
      push.sendLogEntry.mockImplementation(() => {
        callOrder.push('push')
      })

      await service.info('events', 'Test', { systemId: 'sys-1', sessionId: 'session-1' })

      expect(callOrder).toEqual(['persist', 'push'])
    })

    it('pushes the same entry that was persisted to the session', async () => {
      await service.info('events', 'Test', { systemId: 'sys-1', sessionId: 'session-1' })

      const persistedEntry = sessions.addLog.mock.calls[0][2]
      const pushedEntry = push.sendLogEntry.mock.calls[0][0]
      expect(persistedEntry).toBe(pushedEntry)
    })
  })
})
