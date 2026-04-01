import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListenerManagerService } from '../../../../src/main/services/listeners/listener-manager.service'
import type { Environment, ListenerConfig, OutputConfig } from '../../../../src/shared/models'
import type { ListenerLifecycle } from '../../../../src/main/services/listeners/listener'
import { VariableReplacementService } from '../../../../src/main/services/variable-replacement.service'

function makeListenerConfig(overrides: Partial<ListenerConfig> = {}): ListenerConfig {
  return {
    systemId: 'sys-1',
    outputId: 'output-1',
    sessionId: 'session-1',
    cloud: {},
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
  let create: any
  let replaceVariablesInObjectSpy: ReturnType<typeof vi.spyOn>
  let lifecycle: ListenerLifecycle
  let service: ListenerManagerService
  let sentValueIndex: { hydrateFromSessionStorage: ReturnType<typeof vi.fn> }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    let state: ListenerLifecycle['state'] = 'stopped'
    lifecycle = {
      listener: { id: 'listener-1', start: vi.fn(), stop: vi.fn() },
      get state() {
        return state
      },
      start: vi.fn(async () => {
        state = 'running'
      }),
      stop: vi.fn(async () => {
        state = 'stopped'
      })
    }

    create = vi.fn().mockResolvedValue(lifecycle)
    replaceVariablesInObjectSpy = vi
      .spyOn(VariableReplacementService.prototype, 'replaceVariablesInObject')
      .mockImplementation((obj: unknown) => obj)

    sentValueIndex = {
      hydrateFromSessionStorage: vi.fn().mockResolvedValue(undefined)
    }

    service = new ListenerManagerService({ create } as any, sentValueIndex as any)
  })

  it('resolves output variables and passes transformed config into lifecycle factory', async () => {
    const output = makeOutputConfig({
      config: { streamName: '{{STREAM_NAME}}', region: '{{REGION}}' }
    })

    replaceVariablesInObjectSpy.mockReturnValue({
      streamName: 'resolved-stream',
      region: 'eu-west-1'
    })

    await service.startListener(makeListenerConfig(), output, makeEnvironment())

    expect(replaceVariablesInObjectSpy).toHaveBeenCalledWith(output.config, { REGION: 'eu-west-1' })
    expect(create).toHaveBeenCalledWith({
      listenerConfig: makeListenerConfig(),
      outputConfig: {
        ...output,
        config: { streamName: 'resolved-stream', region: 'eu-west-1' }
      }
    })
  })

  it('applies output listener defaults when start config omits filter settings', async () => {
    const output = makeOutputConfig({
      listenerDefaults: {
        filterMode: 'any',
        includeUnmatched: true,
        filters: [
          {
            type: 'sessionCorrelation',
            config: {
              sentPath: '$.id',
              receivedPath: '$.eventId',
              includeHistoricalSent: true
            }
          }
        ]
      }
    })

    await service.startListener(makeListenerConfig(), output)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      listenerConfig: expect.objectContaining({
        filterMode: 'any',
        includeUnmatched: true,
        filters: expect.any(Array)
      })
    }))
  })

  it('hydrates historical sent values when correlation filter requests it', async () => {
    const output = makeOutputConfig({
      listenerDefaults: {
        filters: [
          {
            type: 'sessionCorrelation',
            config: {
              sentPath: '$.id',
              receivedPath: '$.eventId',
              includeHistoricalSent: true
            }
          }
        ]
      }
    })

    await service.startListener(makeListenerConfig(), output)

    expect(sentValueIndex.hydrateFromSessionStorage).toHaveBeenCalledWith('sys-1', 'session-1')
  })

  it('starts lifecycle asynchronously after create()', async () => {
    await service.startListener(makeListenerConfig(), makeOutputConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(lifecycle.start).toHaveBeenCalledTimes(1)
  })

  it('returns listenerId and current tracked status payload', async () => {
    const result = await service.startListener(makeListenerConfig(), makeOutputConfig())

    expect(result).toEqual({ listenerId: 'listener-1', status: 'starting' })
  })

  it('tracks listeners in status list once started', async () => {
    await service.startListener(makeListenerConfig(), makeOutputConfig())
    expect(service.getStatus()).toEqual([
      expect.objectContaining({
        listenerId: 'listener-1',
        outputId: 'output-1',
        sessionId: 'session-1',
        status: expect.any(String),
      })
    ])
  })

  it('stopListener is a no-op for unknown ids', async () => {
    await service.stopListener('missing-listener')
    expect(lifecycle.stop).not.toHaveBeenCalled()
  })

  it('stopListener stops a tracked listener', async () => {
    await service.startListener(makeListenerConfig(), makeOutputConfig())
    await service.stopListener('listener-1')

    expect(lifecycle.stop).toHaveBeenCalledTimes(1)
  })

  it('stopAll stops all tracked listeners', async () => {
    await service.startListener(makeListenerConfig(), makeOutputConfig())

    await expect(service.stopAll()).resolves.toBeUndefined()
    expect(lifecycle.stop).toHaveBeenCalledTimes(1)
  })
})
