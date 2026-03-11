import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ListenerManagerService } from '../../../../src/main/services/listeners/listener-manager.service'
import type { ListenerConfig, OutputConfig, Environment } from '../../../../src/shared/models'

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures the variables are available inside the vi.mock factory.
// Regular (non-arrow) functions are used as constructors to avoid TypeError in Vitest 4.
// ---------------------------------------------------------------------------

const mockKinesisListenerStart = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const mockKinesisListenerStop = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock(
  '../../../../src/main/services/listeners/kinesis-listener',
  () => ({
    /* eslint-disable @typescript-eslint/no-explicit-any */
    KinesisListener: vi.fn(function (this: any) {
      this.start = mockKinesisListenerStart
      this.stop = mockKinesisListenerStop
    })
    /* eslint-enable @typescript-eslint/no-explicit-any */
  })
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPushService() {
  return {
    sendListenerLifecycle: vi.fn(),
    sendListenerData: vi.fn(),
    sendListenerError: vi.fn(),
    sendLogEntry: vi.fn()
  }
}

function makeMockVariableReplacement() {
  return {
    replaceVariables: vi.fn((s: string) => s),
    replaceVariablesInObject: vi.fn((obj: unknown) => obj),
    findUnresolvedVariables: vi.fn(() => [])
  }
}

function makeListenerConfig(overrides: Partial<ListenerConfig> = {}): ListenerConfig {
  return {
    outputId: 'output-1',
    sessionId: 'session-1',
    ...overrides
  }
}

function makeKinesisOutputConfig(overrides: Partial<OutputConfig> = {}): OutputConfig {
  return {
    id: 'output-1',
    name: 'My Kinesis Stream',
    type: 'kinesis',
    config: { streamName: 'my-stream', region: 'us-east-1' },
    ...overrides
  }
}

function makeEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    id: 'env-1',
    systemId: 'sys-1',
    name: 'Test Env',
    variables: [{ key: 'REGION', value: 'us-west-2', sensitive: false }],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ListenerManagerService', () => {
  let pushService: ReturnType<typeof makeMockPushService>
  let variableReplacement: ReturnType<typeof makeMockVariableReplacement>
  let service: ListenerManagerService

  beforeEach(() => {
    vi.clearAllMocks()
    pushService = makeMockPushService()
    variableReplacement = makeMockVariableReplacement()
    service = new ListenerManagerService(pushService as any, variableReplacement as any)
  })

  describe('startListener()', () => {
    it('emits starting lifecycle event and returns ListenerStartResult', async () => {
      const result = await service.startListener(
        makeListenerConfig(),
        makeKinesisOutputConfig(),
        'default'
      )

      expect(pushService.sendListenerLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'starting',
          outputId: 'output-1',
          sessionId: 'session-1'
        })
      )
      expect(result.status).toBe('starting')
      expect(result.listenerId).toBeTruthy()
    })

    it('resolves variables in output config using the environment', async () => {
      const env = makeEnvironment()

      await service.startListener(makeListenerConfig(), makeKinesisOutputConfig(), 'default', env)

      expect(variableReplacement.replaceVariablesInObject).toHaveBeenCalledWith(
        expect.objectContaining({ streamName: 'my-stream' }),
        { REGION: 'us-west-2' }
      )
    })

    it('passes empty variables when no environment is provided', async () => {
      await service.startListener(makeListenerConfig(), makeKinesisOutputConfig(), 'default')

      expect(variableReplacement.replaceVariablesInObject).toHaveBeenCalledWith(
        expect.anything(),
        {}
      )
    })

    it('tracks the listener in the internal map', async () => {
      expect(service.getStatus()).toHaveLength(0)

      await service.startListener(makeListenerConfig(), makeKinesisOutputConfig(), 'default')

      expect(service.getStatus()).toHaveLength(1)
    })

    it('starts the listener asynchronously (calls listener.start())', async () => {
      await service.startListener(makeListenerConfig(), makeKinesisOutputConfig(), 'default')

      // Allow microtasks to flush
      await new Promise((r) => setTimeout(r, 0))

      expect(mockKinesisListenerStart).toHaveBeenCalled()
    })

    it('emits error lifecycle when listener.start() rejects', async () => {
      mockKinesisListenerStart.mockRejectedValueOnce(new Error('Stream not found'))

      await service.startListener(makeListenerConfig(), makeKinesisOutputConfig(), 'default')

      await new Promise((r) => setTimeout(r, 0))

      expect(pushService.sendListenerLifecycle).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'error',
          previousState: 'starting',
          error: 'Stream not found'
        })
      )
    })

    it('throws for unsupported listener type', async () => {
      const sqsOutput: OutputConfig = {
        id: 'output-2',
        name: 'SQS Queue',
        type: 'sqs',
        config: { queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/queue', region: 'us-east-1' }
      }

      await expect(
        service.startListener(makeListenerConfig(), sqsOutput, 'default')
      ).rejects.toThrow('Unsupported listener type: sqs')
    })
  })

  describe('stopListener()', () => {
    it('emits stopping and stopped lifecycle events', async () => {
      const result = await service.startListener(
        makeListenerConfig(),
        makeKinesisOutputConfig(),
        'default'
      )

      await service.stopListener(result.listenerId)

      const calls = pushService.sendListenerLifecycle.mock.calls.map(
        (c: unknown[]) => (c[0] as { state?: string })?.state
      )
      expect(calls).toContain('stopping')
      expect(calls).toContain('stopped')
    })

    it('calls listener.stop()', async () => {
      const result = await service.startListener(
        makeListenerConfig(),
        makeKinesisOutputConfig(),
        'default'
      )

      await service.stopListener(result.listenerId)

      expect(mockKinesisListenerStop).toHaveBeenCalled()
    })

    it('does nothing when listenerId is not found', async () => {
      await expect(service.stopListener('non-existent')).resolves.toBeUndefined()
      expect(pushService.sendListenerLifecycle).not.toHaveBeenCalledWith(
        expect.objectContaining({ state: 'stopping' })
      )
    })

    it('records stoppedAt timestamp in status', async () => {
      const result = await service.startListener(
        makeListenerConfig(),
        makeKinesisOutputConfig(),
        'default'
      )

      await service.stopListener(result.listenerId)

      const statuses = service.getStatus()
      const stopped = statuses.find((s) => s.listenerId === result.listenerId)
      expect(stopped?.stoppedAt).toBeTruthy()
      expect(stopped?.status).toBe('stopped')
    })
  })

  describe('getStatus()', () => {
    it('returns empty array when no listeners are active', () => {
      expect(service.getStatus()).toEqual([])
    })

    it('returns status of all tracked listeners', async () => {
      await service.startListener(
        makeListenerConfig({ outputId: 'output-1', sessionId: 'session-1' }),
        makeKinesisOutputConfig({ id: 'output-1' }),
        'default'
      )
      await service.startListener(
        makeListenerConfig({ outputId: 'output-2', sessionId: 'session-2' }),
        makeKinesisOutputConfig({ id: 'output-2', config: { streamName: 'stream-2', region: 'eu-west-1' } }),
        'default'
      )

      const statuses = service.getStatus()
      expect(statuses).toHaveLength(2)
    })

    it('returns a copy of status (not internal reference)', async () => {
      await service.startListener(makeListenerConfig(), makeKinesisOutputConfig(), 'default')

      const [status] = service.getStatus()
      const capturedStatus = status.status // capture before mutation
      status.status = 'error' // mutate the copy

      const [fresh] = service.getStatus()
      expect(fresh.status).toBe(capturedStatus) // internal state unchanged by mutation
    })
  })

  describe('stopAll()', () => {
    it('stops all active listeners', async () => {
      await service.startListener(
        makeListenerConfig({ outputId: 'output-1', sessionId: 'session-1' }),
        makeKinesisOutputConfig({ id: 'output-1' }),
        'default'
      )
      await service.startListener(
        makeListenerConfig({ outputId: 'output-2', sessionId: 'session-2' }),
        makeKinesisOutputConfig({ id: 'output-2', config: { streamName: 'stream-2', region: 'eu-west-1' } }),
        'default'
      )

      await service.stopAll()

      const statuses = service.getStatus()
      expect(statuses.every((s) => s.status === 'stopped')).toBe(true)
      expect(mockKinesisListenerStop).toHaveBeenCalledTimes(2)
    })

    it('resolves immediately when there are no active listeners', async () => {
      await expect(service.stopAll()).resolves.toBeUndefined()
    })
  })
})
