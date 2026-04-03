import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

import { StorageService, StoragePaths } from '../../../../src/main/services/storage'
import { SettingsService } from '../../../../src/main/services/settings.service'
import { ListenersApi } from '../../../../src/main/api/listeners'
import type { ListenerManagerService } from '../../../../src/main/services/listeners/listener-manager.service'
import type {
  ListenerConfig,
  ListenerStartResult,
  ListenerStatus,
  System,
  OutputConfig,
  Environment,
} from '../../../../src/shared/models'

let tmpDir: string
let storage: StorageService
let settings: SettingsService
let listenerManager: ListenerManagerService
let api: ListenersApi

const SYS_ID = 'sys-1'
const OUTPUT_ID = 'out-1'
const SESSION_ID = 'sess-1'
const LISTENER_ID = 'listener-1'

function makeSystem(overrides: Partial<System> = {}): System {
  const output: OutputConfig = {
    id: OUTPUT_ID,
    name: 'Orders Stream',
    type: 'kinesis',
    contentType: 'json',
    config: { streamName: 'orders-stream', region: 'us-east-1' }
  }
  return {
    id: SYS_ID,
    name: 'Test System',
    inputs: [],
    outputs: [output],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }
}

function makeListenerConfig(overrides: Partial<ListenerConfig> = {}): ListenerConfig {
  return {
    systemId: SYS_ID,
    outputId: OUTPUT_ID,
    sessionId: SESSION_ID,
    cloud: {},
    ...overrides
  }
}

function makeStartResult(): ListenerStartResult {
  return { listenerId: LISTENER_ID, status: 'starting' }
}

function makeListenerStatus(): ListenerStatus {
  return {
    listenerId: LISTENER_ID,
    outputId: OUTPUT_ID,
    sessionId: SESSION_ID,
    status: 'running',
    eventsReceived: 0
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-listeners-api-test-'))
  storage = new StorageService()
  settings = new SettingsService(storage, tmpDir)

  listenerManager = {
    startListener: vi.fn().mockResolvedValue(makeStartResult()),
    stopListener: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue([makeListenerStatus()]),
    stopAll: vi.fn().mockResolvedValue(undefined)
  } as unknown as ListenerManagerService

  api = new ListenersApi(storage, settings, listenerManager);
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// start
// ---------------------------------------------------------------------------

describe('ListenersApi — start', () => {
  it('calls listenerManager.startListener with config, loaded output, and undefined environment when no environmentId', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYS_ID), system)

    const config = makeListenerConfig()
    await api.start(config)

    expect(listenerManager.startListener).toHaveBeenCalledWith(
      config,
      system.outputs[0],
      undefined
    )
  })

  it('loads the environment and passes it to startListener when environmentId is provided', async () => {
    const system = makeSystem()
    await storage.write(StoragePaths.system(tmpDir, SYS_ID), system)

    const ENV_ID = 'env-1'
    const env: Environment = {
      id: ENV_ID,
      systemId: SYS_ID,
      name: 'Staging',
      variables: [{ key: 'REGION', value: 'eu-west-1', sensitive: false }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await storage.write(StoragePaths.environment(tmpDir, SYS_ID, ENV_ID), env)

    const config = makeListenerConfig({ environmentId: ENV_ID })
    await api.start(config)

    expect(listenerManager.startListener).toHaveBeenCalledWith(
      config,
      system.outputs[0],
      env
    )
  })

  it('returns the ListenerStartResult from the manager', async () => {
    await storage.write(StoragePaths.system(tmpDir, SYS_ID), makeSystem())

    const result = await api.start(makeListenerConfig())

    expect(result).toEqual(makeStartResult())
  })

  it('throws when the system does not exist', async () => {
    await expect(api.start(makeListenerConfig())).rejects.toThrow(`System not found: ${SYS_ID}`)
  })

  it('throws when the output does not exist in the system', async () => {
    const system = makeSystem({ outputs: [] })
    await storage.write(StoragePaths.system(tmpDir, SYS_ID), system)

    await expect(api.start(makeListenerConfig())).rejects.toThrow(
      `Output not found: ${OUTPUT_ID}`
    )
  })

  it('throws when listenerManager is not initialized', async () => {
    const uninitializedApi = new ListenersApi(storage, settings, undefined as any)

    await expect(uninitializedApi.start(makeListenerConfig())).rejects.toThrow(
      'ListenerManagerService not initialized'
    )
  })
})

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------

describe('ListenersApi — stop', () => {
  it('delegates to listenerManager.stopListener with the given listenerId', async () => {
    await api.stop(LISTENER_ID)

    expect(listenerManager.stopListener).toHaveBeenCalledWith(LISTENER_ID)
  })

  it('resolves without error', async () => {
    await expect(api.stop(LISTENER_ID)).resolves.toBeUndefined()
  })

  it('throws when listenerManager is not initialized', async () => {
    const uninitializedApi = new ListenersApi(storage, settings, undefined as any)

    await expect(uninitializedApi.stop(LISTENER_ID)).rejects.toThrow(
      'ListenerManagerService not initialized'
    )
  })
})

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

describe('ListenersApi — status', () => {
  it('returns the status list from listenerManager.getStatus', async () => {
    const result = await api.status()

    expect(result).toEqual([makeListenerStatus()])
  })

  it('delegates to listenerManager.getStatus', async () => {
    await api.status()

    expect(listenerManager.getStatus).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when no listeners are active', async () => {
    vi.mocked(listenerManager.getStatus).mockReturnValue([])

    const result = await api.status()

    expect(result).toEqual([])
  })

  it('throws when listenerManager is not initialized', async () => {
    const uninitializedApi = new ListenersApi(storage, settings, undefined as any)

    await expect(uninitializedApi.status()).rejects.toThrow(
      'ListenerManagerService not initialized'
    )
  })
})
