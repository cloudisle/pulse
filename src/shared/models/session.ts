import { LogEntry } from './log'

export type EventDirection = 'sent' | 'received';
export type EventStatus = 'pending' | 'success' | 'failed';

export interface SessionEvent {
  id: string; // UUID
  sessionId: string; // FK → Session
  direction: EventDirection;
  timestamp: string; // ISO 8601
  inputId?: string; // FK → InputConfig (for sent events)
  outputId?: string; // FK → OutputConfig (for received events)
  listenerId?: string; // FK → active listener (for received events)
  schemaId?: string; // FK → Schema (for sent events)
  profileIds?: string[]; // FK[] → Profile (profiles active at send time)
  payload: Record<string, any>; // the actual event body
  metadata?: Record<string, any>; // cloud-specific metadata (e.g. sequence number, message ID)
  status: EventStatus;
  error?: string; // error message if status is 'failed'
}

export interface Session {
  id: string; // UUID
  systemId: string; // FK → System
  name?: string; // auto-generated or user-supplied
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface SessionDetail extends Session {
  events: SessionEvent[];
  logs: LogEntry[];
}
