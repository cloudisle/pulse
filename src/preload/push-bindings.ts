import type { IpcRenderer, IpcRendererEvent } from 'electron'
import type { ListenerDataEvent, ListenerErrorEvent, ListenerLifecycleEvent } from '../shared/models'
import type { LogEntry } from '../shared/models'

export function createPushBindings(ipcRenderer: IpcRenderer) {
  return {
    listeners: {
      onLifecycle(callback: (event: ListenerLifecycleEvent) => void): () => void {
        const handler = (_e: IpcRendererEvent, data: ListenerLifecycleEvent) => callback(data)
        ipcRenderer.on('listeners:lifecycle', handler)
        return () => ipcRenderer.removeListener('listeners:lifecycle', handler)
      },
      onData(callback: (event: ListenerDataEvent) => void): () => void {
        const handler = (_e: IpcRendererEvent, data: ListenerDataEvent) => callback(data)
        ipcRenderer.on('listeners:data', handler)
        return () => ipcRenderer.removeListener('listeners:data', handler)
      },
      onError(callback: (event: ListenerErrorEvent) => void): () => void {
        const handler = (_e: IpcRendererEvent, data: ListenerErrorEvent) => callback(data)
        ipcRenderer.on('listeners:error', handler)
        return () => ipcRenderer.removeListener('listeners:error', handler)
      }
    },
    log: {
      onEntry(callback: (entry: LogEntry) => void): () => void {
        const handler = (_e: IpcRendererEvent, data: LogEntry) => callback(data)
        ipcRenderer.on('log:entry', handler)
        return () => ipcRenderer.removeListener('log:entry', handler)
      }
    }
  }
}
