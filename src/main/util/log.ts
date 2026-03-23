import {LogLevel} from "../../shared/models";
import App from "../../app";
import {LogMessage} from "../events/logs";

export async function log(level: LogLevel, source: string, message: string, metadata: Record<string, any> = {}) {
    try {
        const {sessionId, ...rest} = metadata;

        const entry = new LogMessage({
            level,
            source,
            message,
            metadata: rest,
            sessionId,
        });

        await App.channels.log.entry.send(entry);

        // TODO: systemId should be resolvable. sessionId too?
        if (sessionId && metadata?.systemId !== undefined) {
            await App.api.sessions.addLog(metadata.systemId, sessionId, entry);
        }
    } catch (error) {
        console.error("Unable to record log entry", error);
    }
}

export interface Logger {
    log(level: LogLevel, message: string, metadata?: Record<string, any>): Promise<void>;
    debug(message: string, metadata?: Record<string, any>): Promise<void>;
    info(message: string, metadata?: Record<string, any>): Promise<void>;
    warn(message: string, metadata?: Record<string, any>): Promise<void>;
    error(message: string, metadata?: Record<string, any>): Promise<void>;
}

export function logger(source: string): Logger {
    return {
        log: (level: LogLevel, message: string, metadata: Record<string, any>) => log(level, source, message, metadata),
        debug: (message: string, metadata: Record<string, any>) => log('debug', source, message, metadata),
        info: (message: string, metadata: Record<string, any>) => log('info', source, message, metadata),
        warn: (message: string, metadata: Record<string, any>) => log('warn', source, message, metadata),
        error: (message: string, metadata: Record<string, any>) => log('error', source, message, metadata),
    }
}