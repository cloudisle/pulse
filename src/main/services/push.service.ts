import type { BrowserWindow } from 'electron'
import type { ListenerDataEvent, ListenerErrorEvent, ListenerLifecycleEvent } from '../../shared/models'
import type { LogEntry } from '../../shared/models'

export class PushService {
  constructor(private readonly window: BrowserWindow) {}

  sendListenerLifecycle(event: ListenerLifecycleEvent): void {
    this.window.webContents.send('listeners:lifecycle', event)
  }

  sendListenerData(event: ListenerDataEvent): void {
    this.window.webContents.send('listeners:data', event)
  }

  sendListenerError(event: ListenerErrorEvent): void {
    this.window.webContents.send('listeners:error', event)
  }

  sendLogEntry(entry: LogEntry): void {
    this.window.webContents.send('log:entry', entry)
  }
}
