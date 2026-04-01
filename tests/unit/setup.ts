import { vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData'),
    on: vi.fn(),
    quit: vi.fn()
  }
}))

vi.mock('../../src/app', () => ({
  default: {
    channels: {
      log: {
        entry: { send: vi.fn() }
      },
      listeners: {
        lifecycle: { send: vi.fn() },
        data: { send: vi.fn() },
        error: { send: vi.fn() }
      }
    },
    api: {
      sessions: {
        addEvent: vi.fn(),
        addLog: vi.fn()
      }
    }
  }
}))

