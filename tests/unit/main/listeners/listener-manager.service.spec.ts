import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListenerManagerService } from '../../../../src/main/services/listeners/listener-manager.service'
import type { Environment, ListenerConfig, OutputConfig } from '../../../../src/shared/models'
import type { ListenerLifecycle } from '../../../../src/main/services/listeners/listener'

function makeListenerConfig(overrides: Partial<ListenerConfig> = {}): ListenerConfig {
  return {
    outputId: 'output-1',
    sessionId: 'session-1',
    ...overrides
  }
}

function makeOutputConfig(overrides: Partial<OutputConfig> = {}): OutputConfig {
  const base: OutputConfig = {
    id: 'output-1',
    name: 'Orders Stream',
    type: 'kinesis',
    contentType: 'json',
    config: {
      streamName: 'orders-stream',
      region: 'us-east-1'
    }
  }

  return {
    ...base,
    ...overrides,
    contentType: overrides.contentType ?? base.contentType,
    config: overrides.config ?? base.config
  }
}

function makeEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'env-1',
    systemId: 'sys-1',
    name: 'test',
    variables: [{ key: 'REGION', value: 'eu-west-1', sensitive: false }],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('ListenerManagerService', () => {
  let create: ReturnType<typeof vi.fn>
  let replaceVariablesInObject: ReturnType<typeof vi.fn>
  let start: ReturnType<typeof vi.fn>
  let stop: ReturnType<typeof vi.fn>
  let lifecycle: ListenerLifecycle
  let service: ListenerManagerService

  beforeEach(() => {
    start = vi.fn().mockResolvedValue(undefined)
    stop = vi.fn().mockResolvedValue(undefined)

    let state: ListenerLifecycle['state'] = 'stopped'
    lifecycle = {
      listener: { id: 'listener-1', start: vi.fn(), stop: vi.fn() },
      get state() {
        return state
      },
      start: vi.fn(async () => {
        state = 'running'
        await start()
      }),
      stop: vi.fn(async () => {
        state = 'stopped'
        await stop()
      })
    }

    create = vi.fn().mockResolvedValue(lifecycle)
    replaceVariablesInObject = vi.fn((obj: unknown) => obj)

    service = new ListenerManagerService(
      { create } as any,
      { replaceVariablesInObject } as any
    )
  })

  it('resolves output variables and passes transformed config into lifecycle factory', async () => {
    const output = makeOutputConfig({
      config: { streamName: '${STREAM_NAME}', region: '${REGION}' }
    })

    replaceVariablesInObject.mockReturnValue({
      streamName: 'resolved-stream',
      region: 'eu-west-1'
    })

    await service.startListener(makeListenerConfig(), output, makeEnvironment())

    expect(replaceVariablesInObject).toHaveBeenCalledWith(output.config, { REGION: 'eu-west-1' })
    expect(create).toHaveBeenCalledWith({
      listenerConfig: makeListenerConfig(),
      outputConfig: {
        ...output,
        config: { streamName: 'resolved-stream', region: 'eu-west-1' }
      }
    })
  })

  it('starts lifecycle asynchronously after create()', async () => {
    await service.startListener(makeListenerConfig(), makeOutputConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(lifecycle.start).toHaveBeenCalledTimes(1)
  })

  it('returns listenerId and current tracked status payload', async () => {
    const result = await service.startListener(makeListenerConfig(), makeOutputConfig())

    expect(result).toEqual({ listenerId: 'listener-1', status: 'error' })
  })

  it('returns empty status list because no listener entries are currently added', async () => {
    await service.startListener(makeListenerConfig(), makeOutputConfig())
    expect(service.getStatus()).toEqual([])
  })

  it('stopListener is a no-op for unknown ids', async () => {
    await service.stopListener('missing-listener')
    expect(lifecycle.stop).not.toHaveBeenCalled()
  })

  it('stopAll resolves cleanly even with no tracked listeners', async () => {
    await expect(service.stopAll()).resolves.toBeUndefined()
  })
})
