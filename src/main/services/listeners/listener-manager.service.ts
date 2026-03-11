import { randomUUID } from 'crypto'
import type { PushService } from '../push.service'
import type { VariableReplacementService } from '../variable-replacement.service'
import type {
  ListenerConfig,
  ListenerStatus,
  ListenerStartResult
} from '../../../shared/models'
import type { OutputConfig, KinesisConfig } from '../../../shared/models'
import type { Environment } from '../../../shared/models'
import { KinesisListener } from './kinesis-listener'

type AnyListener = KinesisListener

export class ListenerManagerService {
  private readonly listeners = new Map<
    string,
    { listener: AnyListener; status: ListenerStatus }
  >()

  constructor(
    private readonly pushService: PushService,
    private readonly variableReplacement: VariableReplacementService
  ) {}

  /**
   * Resolves variables in the output config, creates the appropriate listener,
   * starts it asynchronously, tracks it in an internal map, emits `starting`
   * lifecycle event, and returns a `ListenerStartResult`.
   */
  async startListener(
    config: ListenerConfig,
    outputConfig: OutputConfig,
    awsProfile: string,
    environment?: Environment
  ): Promise<ListenerStartResult> {
    const listenerId = randomUUID()
    const now = new Date().toISOString()

    const variables = this.buildVariables(environment)
    const resolvedConfig = this.variableReplacement.replaceVariablesInObject(
      outputConfig.config,
      variables
    ) as KinesisConfig

    const status: ListenerStatus = {
      listenerId,
      outputId: config.outputId,
      sessionId: config.sessionId,
      status: 'starting',
      startedAt: now,
      eventsReceived: 0
    }

    this.pushService.sendListenerLifecycle({
      listenerId,
      outputId: config.outputId,
      sessionId: config.sessionId,
      state: 'starting',
      timestamp: now
    })

    const listener = this.createListener(
      listenerId,
      config,
      outputConfig.type,
      resolvedConfig,
      awsProfile
    )

    this.listeners.set(listenerId, { listener, status })

    listener
      .start()
      .then(() => {
        const entry = this.listeners.get(listenerId)
        if (entry) entry.status.status = 'running'
      })
      .catch((err: unknown) => {
        const entry = this.listeners.get(listenerId)
        if (entry) {
          entry.status.status = 'error'
          entry.status.lastError = err instanceof Error ? err.message : String(err)
        }
        this.pushService.sendListenerLifecycle({
          listenerId,
          outputId: config.outputId,
          sessionId: config.sessionId,
          previousState: 'starting',
          state: 'error',
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err)
        })
      })

    return { listenerId, status: 'starting' }
  }

  /**
   * Signals the listener to stop, emits `stopping` then `stopped` lifecycle events.
   */
  async stopListener(listenerId: string): Promise<void> {
    const entry = this.listeners.get(listenerId)
    if (!entry) return

    const previousState = entry.status.status
    const stoppingTs = new Date().toISOString()

    entry.status.status = 'stopping'
    this.pushService.sendListenerLifecycle({
      listenerId,
      outputId: entry.status.outputId,
      sessionId: entry.status.sessionId,
      previousState,
      state: 'stopping',
      timestamp: stoppingTs
    })

    await entry.listener.stop()

    const stoppedTs = new Date().toISOString()
    entry.status.status = 'stopped'
    entry.status.stoppedAt = stoppedTs
    this.pushService.sendListenerLifecycle({
      listenerId,
      outputId: entry.status.outputId,
      sessionId: entry.status.sessionId,
      previousState: 'stopping',
      state: 'stopped',
      timestamp: stoppedTs
    })
  }

  /** Returns the current status of all tracked listeners. */
  getStatus(): ListenerStatus[] {
    return Array.from(this.listeners.values()).map((e) => ({ ...e.status }))
  }

  /** Stops all active listeners — called on app shutdown or session end. */
  async stopAll(): Promise<void> {
    const ids = Array.from(this.listeners.keys())
    await Promise.all(ids.map((id) => this.stopListener(id)))
  }

  private createListener(
    listenerId: string,
    config: ListenerConfig,
    type: OutputConfig['type'],
    resolvedConfig: KinesisConfig,
    awsProfile: string
  ): AnyListener {
    if (type === 'kinesis') {
      return new KinesisListener(
        { listenerId, listenerConfig: config, kinesisConfig: resolvedConfig, awsProfile },
        this.pushService
      )
    }
    throw new Error(`Unsupported listener type: ${type}`)
  }

  private buildVariables(environment?: Environment): Record<string, string> {
    if (!environment) return {}
    return environment.variables.reduce(
      (acc, v) => {
        acc[v.key] = v.value
        return acc
      },
      {} as Record<string, string>
    )
  }
}
