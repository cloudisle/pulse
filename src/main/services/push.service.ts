import type { WebContents } from 'electron'

export class PushService {
  private webContents: WebContents | null = null

  initialize(webContents: WebContents): void {
    this.webContents = webContents
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.webContents) {
      throw new Error('PushService not initialized')
    }
    this.webContents.send(channel, ...args)
  }
}
