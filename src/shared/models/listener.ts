import { SessionEvent } from './session'
import type { CloudOperationSettings } from './aws'

export type ListenerLifecycleState = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
export type ListenerFilterMode = 'all' | 'any';
export type ListenerFilterType = 'jsonpath' | 'regex';
export type ListenerStopReason = 'user-request' | 'session-ended' | 'app-shutdown' | 'fatal-error';

export interface JsonPathFilterConfig {
  path: string; // e.g. "$.header.eventType"
  operator: 'equals' | 'notEquals' | 'contains' | 'exists';
  value?: any; // required for all operators except 'exists'
}

export interface RegexFilterConfig {
  pattern: string; // regex applied to payload text or extracted field
  flags?: string; // e.g. "i"
  targetPath?: string; // optional JSONPath; if omitted the full payload is stringified
}

export interface ListenerFilter {
  id?: string;
  enabled?: boolean; // default: true
  type: ListenerFilterType;
  config: JsonPathFilterConfig | RegexFilterConfig;
}

export interface ListenerConfig {
  systemId: string; // FK → System
  outputId: string; // FK → OutputConfig
  sessionId: string; // FK → Session (used for filter context)
  environmentId?: string; // FK → Environment (used for variable replacement)
  cloud: CloudOperationSettings; // cloud-provider settings for this listener operation
  filters?: ListenerFilter[];
  filterMode?: ListenerFilterMode; // default: 'all'
  includeUnmatched?: boolean; // default: false
}

export interface ListenerStatus {
  listenerId: string;
  outputId: string;
  sessionId: string;
  status: ListenerLifecycleState;
  startedAt?: string; // ISO 8601
  stoppedAt?: string; // ISO 8601
  lastEventAt?: string; // ISO 8601
  eventsReceived: number;
  stopReason?: ListenerStopReason;
  lastError?: string;
}

export interface ListenerLifecycleEvent {
  listenerId: string;
  outputId: string;
  sessionId: string;
  previousState?: ListenerLifecycleState;
  state: ListenerLifecycleState;
  timestamp: string; // ISO 8601
  reason?: ListenerStopReason;
  error?: string;
}

export interface ListenerDataEvent {
  listenerId: string;
  sessionId: string;
  event: SessionEvent; // the received event (direction = 'received')
}

export interface ListenerErrorEvent {
  listenerId: string;
  error: string;
  timestamp: string; // ISO 8601
  recoverable?: boolean; // when true, listener keeps running
}

export interface ListenerStartResult {
  listenerId: string;
  status: ListenerLifecycleState;
}
