import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { StorageService, StoragePaths } from '../services/storage'
import { SettingsService } from '../services/settings.service'
import type { Session, SessionDetail, SessionEvent } from '../../shared/models/session'
import type { LogEntry } from '../../shared/models/log'

export class SessionsApi {

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService
  ) {}

  async create(systemId: string): Promise<Session> {
    const dataDir = await this.settings.getDataPath()
    const id = randomUUID()
    const now = new Date()
    const dateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD

    // Load existing sessions once — used for day-count naming and limit enforcement
    const existing = await this._listSessions(dataDir, systemId)
    const dayCount = existing.filter((s) => s.createdAt.startsWith(dateStr)).length

    const name = `Session ${dateStr} #${dayCount + 1}`
    const nowIso = now.toISOString()

    const session: Session = {
      id,
      systemId,
      name,
      createdAt: nowIso,
      updatedAt: nowIso
    }

    const sessionDir = path.join(dataDir, 'systems', systemId, 'sessions', id)
    await this.storage.ensureDir(path.join(sessionDir, 'events'))
    await this.storage.write(StoragePaths.session(dataDir, systemId, id), session)
    await this.storage.write(StoragePaths.sessionLogs(dataDir, systemId, id), [])

    // Enforce session history limit using the already-fetched list plus the new session
    const appSettings = await this.settings.getSettings()
    const limit = appSettings.sessionHistoryLimit
    const allSessions = [...existing, session]
    if (allSessions.length > limit) {
      const sorted = [...allSessions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const toDelete = sorted.slice(0, allSessions.length - limit)
      for (const s of toDelete) {
        await fs.rm(path.join(dataDir, 'systems', systemId, 'sessions', s.id), {
          recursive: true,
          force: true
        })
      }
    }

    return session
  }

  async list(systemId: string): Promise<Session[]> {
    const dataDir = await this.settings.getDataPath()
    const appSettings = await this.settings.getSettings()
    const sessions = await this._listSessions(dataDir, systemId)
    const sorted = sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return sorted.slice(0, appSettings.sessionHistoryLimit)
  }

  async get(systemId: string, id: string): Promise<SessionDetail> {
    const dataDir = await this.settings.getDataPath()
    const session = await this.storage.read<Session>(StoragePaths.session(dataDir, systemId, id))
    if (session === null) {
      throw new Error(`Session not found: ${id}`)
    }

    // Load events
    const eventsDir = path.join(dataDir, 'systems', systemId, 'sessions', id, 'events')
    const events: SessionEvent[] = []
    try {
      const files = await this.storage.listDir(eventsDir)
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const eventId = file.slice(0, -5)
        const ev = await this.storage.read<SessionEvent>(
          StoragePaths.sessionEvent(dataDir, systemId, id, eventId)
        )
        if (ev !== null) events.push(ev)
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    // Load logs
    const logs =
      (await this.storage.read<LogEntry[]>(StoragePaths.sessionLogs(dataDir, systemId, id))) ?? []

    return { ...session, events, logs }
  }

  async delete(systemId: string, id: string): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    const exists = await this.storage.exists(StoragePaths.session(dataDir, systemId, id))
    if (!exists) {
      throw new Error(`Session not found: ${id}`)
    }
    await fs.rm(path.join(dataDir, 'systems', systemId, 'sessions', id), {
      recursive: true,
      force: true
    })
  }

  async rename(systemId: string, id: string, name: string): Promise<Session> {
    const trimmedName = name.trim()
    if (!trimmedName) {
      throw new Error('Session name cannot be empty.')
    }

    const dataDir = await this.settings.getDataPath()
    const existing = await this.storage.read<Session>(StoragePaths.session(dataDir, systemId, id))
    if (existing === null) {
      throw new Error(`Session not found: ${id}`)
    }

    const updated: Session = {
      ...existing,
      name: trimmedName,
      updatedAt: new Date().toISOString()
    }

    await this.storage.write(StoragePaths.session(dataDir, systemId, id), updated)
    return updated
  }

  async addEvent(systemId: string, sessionId: string, sessionEvent: SessionEvent): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    await this.storage.write(
      StoragePaths.sessionEvent(dataDir, systemId, sessionId, sessionEvent.id),
      sessionEvent
    )
  }

  async addLog(systemId: string, sessionId: string, logEntry: LogEntry): Promise<void> {
    const dataDir = await this.settings.getDataPath()
    const logsPath = StoragePaths.sessionLogs(dataDir, systemId, sessionId)
    const existing = (await this.storage.read<LogEntry[]>(logsPath)) ?? []
    existing.push(logEntry)
    await this.storage.write(logsPath, existing)
  }

  private async _listSessions(dataDir: string, systemId: string): Promise<Session[]> {
    const sessionsDir = path.join(dataDir, 'systems', systemId, 'sessions')
    const sessions: Session[] = []
    try {
      const entries = await this.storage.listDir(sessionsDir)
      for (const entry of entries) {
        const s = await this.storage.read<Session>(StoragePaths.session(dataDir, systemId, entry))
        if (s !== null) sessions.push(s)
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    return sessions
  }
}
