import type { CloudOperationSettings } from './aws'

export interface GenerateEventInput {
  schemaId: string; // FK → Schema
  environmentId?: string; // FK → Environment (for variable replacement)
  profileIds?: string[]; // FK[] → Profile (applied in order)
  overrides?: Record<string, any>; // ad-hoc field overrides (dot-notation paths)
}

export interface ValidationWarning {
  elementPath: string;
  message: string;
  severity: 'info' | 'warning';
}

export interface GeneratedEvent {
  schemaId: string;
  payload: Record<string, any>;
  appliedProfiles: string[]; // IDs of profiles that were applied
  warnings: ValidationWarning[];
}

export interface SendEventInput {
  inputId: string; // FK → InputConfig (destination)
  sessionId: string; // FK → Session
  event: GeneratedEvent;
  cloud: CloudOperationSettings; // cloud-provider settings for this send operation
  environmentId?: string; // FK → Environment (for input config variable replacement)
}

export interface SendEventResult {
  success: boolean;
  sessionEventId: string; // FK → SessionEvent (recorded in session)
  metadata?: Record<string, any>; // cloud response metadata
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
}
