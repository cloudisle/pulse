import path from 'path'
import { evaluateJsonPath } from '@main/util/json'
import { StoragePaths, StorageService } from '@main/services/storage.service'
import { SettingsService } from '@main/services/settings.service'
import type { SessionEvent } from '@shared/models'

type SessionKey = `${string}:${string}`

type SessionCache = {
  payloads: unknown[]
  valuesByPath: Map<string, Set<string>>
  hydrated: boolean
}

function makeSessionKey(systemId: string, sessionId: string): SessionKey {
  return `${systemId}:${sessionId}`
}

function toComparableValue(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export class SessionSentValueIndexService {
  private readonly cache = new Map<SessionKey, SessionCache>()

  constructor(
    private readonly storage: StorageService,
    private readonly settings: SettingsService
  ) {}

  recordSentPayload(systemId: string, sessionId: string, payload: unknown): void {
    const entry = this.ensureEntry(systemId, sessionId)
    entry.payloads.push(payload)

    // Keep any already-tracked path sets warm as new sent events come in.
    for (const [pathExpr, values] of entry.valuesByPath.entries()) {
      const value = toComparableValue(evaluateJsonPath(payload, pathExpr))
      if (value !== null) {
        values.add(value)
      }
    }
  }

  hasSentValue(systemId: string, sessionId: string, sentPath: string, receivedValue: unknown): boolean {
    const comparableReceived = toComparableValue(receivedValue)
    if (comparableReceived === null) return false

    const values = this.getOrBuildPathSet(systemId, sessionId, sentPath)
    return values.has(comparableReceived)
  }

  async hydrateFromSessionStorage(systemId: string, sessionId: string): Promise<void> {
    const entry = this.ensureEntry(systemId, sessionId)
    if (entry.hydrated) {
      return
    }

    const dataDir = await this.settings.getDataPath()
    const eventsDir = path.join(dataDir, 'systems', systemId, 'sessions', sessionId, 'events')

    let files: string[]
    try {
      files = await this.storage.listDir(eventsDir)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        entry.hydrated = true
        return
      }
      throw error
    }

    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const eventId = file.slice(0, -5)
      const ev = await this.storage.read<SessionEvent>(
        StoragePaths.sessionEvent(dataDir, systemId, sessionId, eventId)
      )
      if (ev?.direction !== 'sent') continue

      let payload: unknown = ev.payload
      if (typeof ev.payload === 'string') {
        try {
          payload = JSON.parse(ev.payload)
        } catch {
          continue
        }
      }

      this.recordSentPayload(systemId, sessionId, payload)
    }

    entry.hydrated = true
  }

  private ensureEntry(systemId: string, sessionId: string): SessionCache {
    const key = makeSessionKey(systemId, sessionId)
    const existing = this.cache.get(key)
    if (existing) return existing

    const created: SessionCache = {
      payloads: [],
      valuesByPath: new Map<string, Set<string>>(),
      hydrated: false
    }
    this.cache.set(key, created)
    return created
  }

  private getOrBuildPathSet(systemId: string, sessionId: string, sentPath: string): Set<string> {
    const entry = this.ensureEntry(systemId, sessionId)
    const existing = entry.valuesByPath.get(sentPath)
    if (existing) return existing

    const built = new Set<string>()
    for (const payload of entry.payloads) {
      const comparable = toComparableValue(evaluateJsonPath(payload, sentPath))
      if (comparable !== null) {
        built.add(comparable)
      }
    }

    entry.valuesByPath.set(sentPath, built)
    return built
  }
}

