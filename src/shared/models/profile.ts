import { GenerationStrategy } from './generation'

export type OverrideAction = 'set' | 'generate' | 'omit' | 'require' | 'nullify';

export interface ProfileOverride {
  elementPath: string; // dot-notation path to the schema element (e.g. "payload.status")
  action: OverrideAction;
  value?: any; // the override value (when action is 'set')
  generationStrategy?: GenerationStrategy; // override the generation strategy (when action is 'generate')
}

export interface Profile {
  id: string; // UUID
  systemId: string; // FK → System
  name: string;
  description?: string;
  overrides: ProfileOverride[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
