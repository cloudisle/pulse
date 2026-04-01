import { describe, it, expect, vi } from 'vitest'
import { SessionSentValueIndexService } from '../../../../src/main/services/listeners/session-sent-value-index.service'

describe('SessionSentValueIndexService', () => {
  it('matches a received value when the corresponding sent value has been recorded', () => {
    const storage = { listDir: vi.fn(), read: vi.fn() } as any
    const settings = { getDataPath: vi.fn() } as any
    const service = new SessionSentValueIndexService(storage, settings)

    service.recordSentPayload('sys-1', 'session-1', { id: 'abc-123' })

    expect(service.hasSentValue('sys-1', 'session-1', '$.id', 'abc-123')).toBe(true)
    expect(service.hasSentValue('sys-1', 'session-1', '$.id', 'missing')).toBe(false)
  })

  it('hydrates sent events from session storage and ignores non-sent entries', async () => {
    const storage = {
      listDir: vi.fn().mockResolvedValue(['event-1.json', 'event-2.json']),
      read: vi
        .fn()
        .mockResolvedValueOnce({ direction: 'sent', payload: '{"id":"evt-1"}' })
        .mockResolvedValueOnce({ direction: 'received', payload: '{"eventId":"evt-1"}' })
    } as any

    const settings = { getDataPath: vi.fn().mockResolvedValue('/tmp/data') } as any
    const service = new SessionSentValueIndexService(storage, settings)

    await service.hydrateFromSessionStorage('sys-1', 'session-1')

    expect(service.hasSentValue('sys-1', 'session-1', '$.id', 'evt-1')).toBe(true)
    expect(service.hasSentValue('sys-1', 'session-1', '$.id', 'evt-2')).toBe(false)
  })
})

