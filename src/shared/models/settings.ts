import { LogLevel } from './log'

export interface AppSettings {
  sessionHistoryLimit: number; // default: 10
  defaultRegion: string;
  theme: 'light' | 'dark' | 'system';
  dataDirectory: string; // path to JSON data storage
  logLevel: LogLevel;
}
