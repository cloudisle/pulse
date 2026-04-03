import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { StorageService, StoragePaths } from '../../../../src/main/services/storage'
import { SettingsService } from '../../../../src/main/services/settings.service'
import { SessionsApi } from '../../../../src/main/api/sessions'
import type { Session, SessionDetail, SessionEvent } from '../../../../src/shared/models/session'
import type { LogEntry } from '../../../../src/shared/models/log'

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let api: SessionsApi

const SYS_ID = 'sys-1'

function makeSessionEvent(sessionId: string): SessionEvent {
  return {
    id: 'evt-1',
    sessionId,
    direction: 'sent',
    timestamp: new Date().toISOString(),
    payload: JSON.stringify({ key: 'value' }),
    status: 'success'
  }
}

function makeLogEntry(): LogEntry {
  return {
    id: 'log-1',
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'test',
    message: 'test log message'
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-sessions-test-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)
  api = new SessionsApi(storage, settings)
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('SessionsApi — create', () => {
  it('returns a Session with a generated id', async () => {
    const session = await api.create(SYS_ID)

    expect(session.id).toBeTruthy()
    expect(typeof session.id).toBe('string')
  })

  it('sets systemId on the returned session', async () => {
    const session = await api.create(SYS_ID)

    expect(session.systemId).toBe(SYS_ID)
  })

  it('auto-generates a name in the format "Session YYYY-MM-DD #N"', async () => {
    const session = await api.create(SYS_ID)

    expect(session.name).toMatch(/^Session \d{4}-\d{2}-\d{2} #\d+$/)
  })

  it('increments N for multiple sessions created on the same day', async () => {
    const s1 = await api.create(SYS_ID)
    const s2 = await api.create(SYS_ID)

    const dateStr = new Date().toISOString().slice(0, 10)
    expect(s1.name).toBe(`Session ${dateStr} #1`)
    expect(s2.name).toBe(`Session ${dateStr} #2`)
  })

  it('sets createdAt and updatedAt to the same ISO timestamp', async () => {
    const before = new Date().toISOString()
    const session = await api.create(SYS_ID)
    const after = new Date().toISOString()

    expect(session.createdAt >= before).toBe(true)
    expect(session.createdAt <= after).toBe(true)
    expect(session.createdAt).toBe(session.updatedAt)
  })

  it('persists session.json to disk', async () => {
    const session = await api.create(SYS_ID)

    const filePath = StoragePaths.session(tmpDir, SYS_ID, session.id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as Session

    expect(persisted.id).toBe(session.id)
    expect(persisted.systemId).toBe(SYS_ID)
  })

  it('creates the events/ subdirectory', async () => {
    const session = await api.create(SYS_ID)

    const eventsDir = path.join(tmpDir, 'systems', SYS_ID, 'sessions', session.id, 'events')
    const stat = await fs.stat(eventsDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it('creates an empty logs.json', async () => {
    const session = await api.create(SYS_ID)

    const logsPath = StoragePaths.sessionLogs(tmpDir, SYS_ID, session.id)
    const raw = await fs.readFile(logsPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// create — history limit enforcement
// ---------------------------------------------------------------------------

describe('SessionsApi — history limit enforcement', () => {
  it('deletes oldest session when limit is exceeded', async () => {
    // Set history limit to 2
    await settings.updateSettings({ sessionHistoryLimit: 2 })

    const s1 = await api.create(SYS_ID)
    const s2 = await api.create(SYS_ID)
    const s3 = await api.create(SYS_ID)

    // s1 should be deleted, s2 and s3 should remain
    const sessions = await api.list(SYS_ID)
    const ids = sessions.map((s) => s.id)

    expect(ids).not.toContain(s1.id)
    expect(ids).toContain(s2.id)
    expect(ids).toContain(s3.id)
  })

  it('removes the oldest session directory from disk', async () => {
    await settings.updateSettings({ sessionHistoryLimit: 1 })

    const s1 = await api.create(SYS_ID)
    await api.create(SYS_ID)

    const s1Dir = path.join(tmpDir, 'systems', SYS_ID, 'sessions', s1.id)
    await expect(fs.access(s1Dir)).rejects.toThrow()
  })

  it('keeps exactly sessionHistoryLimit sessions after multiple creates', async () => {
    await settings.updateSettings({ sessionHistoryLimit: 3 })

    for (let i = 0; i < 5; i++) {
      await api.create(SYS_ID)
    }

    const sessions = await api.list(SYS_ID)
    expect(sessions).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('SessionsApi — list', () => {
  it('returns an empty array when no sessions exist', async () => {
    const result = await api.list(SYS_ID)

    expect(result).toEqual([])
  })

  it('returns all created sessions', async () => {
    await api.create(SYS_ID)
    await api.create(SYS_ID)

    const result = await api.list(SYS_ID)

    expect(result).toHaveLength(2)
  })

  it('returns sessions sorted by createdAt descending', async () => {
    const s1 = await api.create(SYS_ID)
    const s2 = await api.create(SYS_ID)

    // Ensure s1 has an earlier timestamp by writing it directly
    const s1Path = StoragePaths.session(tmpDir, SYS_ID, s1.id)
    await fs.writeFile(
      s1Path,
      JSON.stringify({ ...s1, createdAt: '2024-01-01T00:00:00.000Z' }),
      'utf-8'
    )
    const s2Path = StoragePaths.session(tmpDir, SYS_ID, s2.id)
    await fs.writeFile(
      s2Path,
      JSON.stringify({ ...s2, createdAt: '2024-01-02T00:00:00.000Z' }),
      'utf-8'
    )

    const result = await api.list(SYS_ID)

    expect(result[0].id).toBe(s2.id)
    expect(result[1].id).toBe(s1.id)
  })

  it('respects sessionHistoryLimit', async () => {
    await settings.updateSettings({ sessionHistoryLimit: 2 })

    await api.create(SYS_ID)
    await api.create(SYS_ID)
    await api.create(SYS_ID)

    const result = await api.list(SYS_ID)

    expect(result.length).toBeLessThanOrEqual(2)
  })

  it('skips directories without session.json', async () => {
    await api.create(SYS_ID)

    const orphanDir = path.join(tmpDir, 'systems', SYS_ID, 'sessions', 'orphan-dir')
    await fs.mkdir(orphanDir, { recursive: true })

    const result = await api.list(SYS_ID)
    expect(result).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

describe('SessionsApi — get', () => {
  it('returns the session metadata', async () => {
    const created = await api.create(SYS_ID)

    const detail = await api.get(SYS_ID, created.id)

    expect(detail.id).toBe(created.id)
    expect(detail.systemId).toBe(SYS_ID)
    expect(detail.name).toBe(created.name)
  })

  it('returns empty events and logs for a fresh session', async () => {
    const created = await api.create(SYS_ID)

    const detail = await api.get(SYS_ID, created.id)

    expect(detail.events).toEqual([])
    expect(detail.logs).toEqual([])
  })

  it('returns events that were added via addEvent', async () => {
    const session = await api.create(SYS_ID)
    const evt = makeSessionEvent(session.id)
    await api.addEvent(SYS_ID, session.id, evt)

    const detail = await api.get(SYS_ID, session.id)

    expect(detail.events).toHaveLength(1)
    expect(detail.events[0].id).toBe(evt.id)
  })

  it('returns logs that were added via addLog', async () => {
    const session = await api.create(SYS_ID)
    const log = makeLogEntry()
    await api.addLog(SYS_ID, session.id, log)

    const detail = await api.get(SYS_ID, session.id)

    expect(detail.logs).toHaveLength(1)
    expect(detail.logs[0].id).toBe(log.id)
  })

  it('throws when the session does not exist', async () => {
    await expect(api.get(SYS_ID, 'non-existent-id')).rejects.toThrow(
      'Session not found: non-existent-id'
    )
  })
})

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('SessionsApi — delete', () => {
  it('removes the session directory from disk', async () => {
    const session = await api.create(SYS_ID)
    const sessionDir = path.join(tmpDir, 'systems', SYS_ID, 'sessions', session.id)

    await api.delete(SYS_ID, session.id)

    await expect(fs.access(sessionDir)).rejects.toThrow()
  })

  it('session is no longer returned by list after deletion', async () => {
    const session = await api.create(SYS_ID)

    await api.delete(SYS_ID, session.id)

    const result = await api.list(SYS_ID)
    expect(result.find((s) => s.id === session.id)).toBeUndefined()
  })

  it('throws when deleting a non-existent session', async () => {
    await expect(api.delete(SYS_ID, 'non-existent-id')).rejects.toThrow(
      'Session not found: non-existent-id'
    )
  })
})

// ---------------------------------------------------------------------------
// rename
// ---------------------------------------------------------------------------

describe('SessionsApi — rename', () => {
  it('updates the session name and persists it to disk', async () => {
    const session = await api.create(SYS_ID)

    const renamed = await api.rename(SYS_ID, session.id, 'Renamed Session')

    expect(renamed.name).toBe('Renamed Session')
    const detail = await api.get(SYS_ID, session.id)
    expect(detail.name).toBe('Renamed Session')
  })

  it('updates updatedAt when renaming', async () => {
    const session = await api.create(SYS_ID)

    const renamed = await api.rename(SYS_ID, session.id, 'Renamed Session')

    expect(new Date(renamed.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(session.updatedAt).getTime()
    )
  })

  it('throws when renaming a non-existent session', async () => {
    await expect(api.rename(SYS_ID, 'missing-id', 'Renamed Session')).rejects.toThrow(
      'Session not found: missing-id'
    )
  })

  it('throws when renaming to an empty name', async () => {
    const session = await api.create(SYS_ID)

    await expect(api.rename(SYS_ID, session.id, '   ')).rejects.toThrow(
      'Session name cannot be empty.'
    )
  })
})

// ---------------------------------------------------------------------------
// addEvent
// ---------------------------------------------------------------------------

describe('SessionsApi — addEvent', () => {
  it('persists the event as an individual JSON file', async () => {
    const session = await api.create(SYS_ID)
    const evt = makeSessionEvent(session.id)

    await api.addEvent(SYS_ID, session.id, evt)

    const filePath = StoragePaths.sessionEvent(tmpDir, SYS_ID, session.id, evt.id)
    const raw = await fs.readFile(filePath, 'utf-8')
    const persisted = JSON.parse(raw) as SessionEvent

    expect(persisted.id).toBe(evt.id)
    expect(persisted.payload).toEqual(evt.payload)
  })

  it('persists multiple events as separate files', async () => {
    const session = await api.create(SYS_ID)
    const evt1: SessionEvent = { ...makeSessionEvent(session.id), id: 'evt-1' }
    const evt2: SessionEvent = { ...makeSessionEvent(session.id), id: 'evt-2' }

    await api.addEvent(SYS_ID, session.id, evt1)
    await api.addEvent(SYS_ID, session.id, evt2)

    const detail = await api.get(SYS_ID, session.id)
    expect(detail.events).toHaveLength(2)
    const ids = detail.events.map((e) => e.id)
    expect(ids).toContain('evt-1')
    expect(ids).toContain('evt-2')
  })
})

// ---------------------------------------------------------------------------
// addLog
// ---------------------------------------------------------------------------

describe('SessionsApi — addLog', () => {
  it('appends a log entry to logs.json', async () => {
    const session = await api.create(SYS_ID)
    const log = makeLogEntry()

    await api.addLog(SYS_ID, session.id, log)

    const logsPath = StoragePaths.sessionLogs(tmpDir, SYS_ID, session.id)
    const raw = await fs.readFile(logsPath, 'utf-8')
    const persisted = JSON.parse(raw) as LogEntry[]

    expect(persisted).toHaveLength(1)
    expect(persisted[0].id).toBe(log.id)
  })

  it('appends multiple log entries in order', async () => {
    const session = await api.create(SYS_ID)
    const log1: LogEntry = { ...makeLogEntry(), id: 'log-1', message: 'first' }
    const log2: LogEntry = { ...makeLogEntry(), id: 'log-2', message: 'second' }

    await api.addLog(SYS_ID, session.id, log1)
    await api.addLog(SYS_ID, session.id, log2)

    const detail = await api.get(SYS_ID, session.id)
    expect(detail.logs).toHaveLength(2)
    expect(detail.logs[0].message).toBe('first')
    expect(detail.logs[1].message).toBe('second')
  })
})
