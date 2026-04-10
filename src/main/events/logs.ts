import {LogEntry, LogLevel} from "@shared/models";
import {randomUUID} from "crypto";

export interface LogData {
    level: LogLevel;
    source: string;
    message: string;
    sessionId?: string;
    metadata?: Record<string, any>
}

export class LogMessage implements LogEntry {

    id: string;
    level: LogLevel;
    message: string;
    source: string;
    timestamp: string;
    metadata: Record<string, any>;
    sessionId?: string;

    constructor(data: LogData) {
        this.id = randomUUID();
        this.level = data.level;
        this.message = data.message;
        this.metadata = data.metadata ?? {};
        this.sessionId = data.sessionId;
        this.source = data.source;
        this.timestamp = new Date().toISOString();
    }
    
}