export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string; // UUID
  timestamp: string; // ISO 8601
  level: LogLevel;
  source: string; // e.g. "listeners", "events", "aws"
  message: string;
  sessionId?: string; // FK → Session (if log is session-scoped)
  metadata?: Record<string, any>;
}
