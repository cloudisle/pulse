import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import Api from '../main/api'
import { createPushBindings } from './push-bindings'

const electronAPIExposed = Api.expose(ipcRenderer, {
  platform: process.platform,
  ...createPushBindings(ipcRenderer)
})

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('electronAPI', electronAPIExposed)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.electronAPI = electronAPIExposed
}
