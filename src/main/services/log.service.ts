import { randomUUID } from 'crypto'
import type { LogLevel, LogEntry } from '../../shared/models/log'
import type { SettingsService } from './settings.service'
import type { SessionsApi } from '../api/sessions'
import type { PushService } from './push.service'

const LOG_LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error']

export interface LogContext {
  systemId?: string
  sessionId?: string
  metadata?: Record<string, any>
}

export class LogService {
  constructor(
    private readonly settings: SettingsService,
    private readonly sessions: SessionsApi,
    private readonly push: PushService
  ) {}

  async debug(source: string, message: string, context?: LogContext): Promise<void> {
    return this.log('debug', source, message, context)
  }

  async info(source: string, message: string, context?: LogContext): Promise<void> {
    return this.log('info', source, message, context)
  }

  async warn(source: string, message: string, context?: LogContext): Promise<void> {
    return this.log('warn', source, message, context)
  }

  async error(source: string, message: string, context?: LogContext): Promise<void> {
    return this.log('error', source, message, context)
  }

  private async log(
    level: LogLevel,
    source: string,
    message: string,
    context?: LogContext
  ): Promise<void> {
    const appSettings = await this.settings.getSettings()
    if (!this.isLevelEnabled(level, appSettings.logLevel)) return

    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      source,
      message,
      ...(context?.sessionId !== undefined && { sessionId: context.sessionId }),
      ...(context?.metadata !== undefined && { metadata: context.metadata })
    }

    if (context?.systemId !== undefined && context?.sessionId !== undefined) {
      try {
        await this.sessions.addLog(context.systemId, context.sessionId, entry)
      } catch {
        // Session persistence failure should not prevent renderer notification
      }
    }

    this.push.sendLogEntry(entry)
  }

  private isLevelEnabled(level: LogLevel, configured: LogLevel): boolean {
    return LOG_LEVEL_ORDER.indexOf(level) >= LOG_LEVEL_ORDER.indexOf(configured)
  }
}
