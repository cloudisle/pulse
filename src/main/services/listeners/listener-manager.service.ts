import type { VariableReplacementService } from '../variable-replacement.service'
import type {
  ListenerConfig,
  ListenerStatus,
  ListenerStartResult,
} from '../../../shared/models'
import type { OutputConfig } from '../../../shared/models'
import type { Environment } from '../../../shared/models'
import {ListenerLifecycleFactory} from "./factory";
import {ListenerLifecycle} from "./listener";

export type ListenerEntry = { listener: ListenerLifecycle, status: ListenerStatus };

export class ListenerManagerService {
  private readonly listeners = new Map<string, ListenerEntry>();

  constructor(
    private readonly factory: ListenerLifecycleFactory,
    private readonly variables: VariableReplacementService
  ) {}

  /**
   * Resolves variables in the output config, creates the appropriate listener,
   * starts it asynchronously, tracks it in an internal map, emits `starting`
   * lifecycle event, and returns a `ListenerStartResult`.
   */
  async startListener(
    listenerConfig: ListenerConfig,
    outputConfig: OutputConfig,
    environment?: Environment
  ): Promise<ListenerStartResult> {
    const variables = this.buildVariables(environment)
    const resolvedConfig = this.variables.replaceVariablesInObject(
      outputConfig.config,
      variables
    ) as OutputConfig['config'];

    const lifecycle = await this.factory.create({
      listenerConfig,
      outputConfig: {
        ...outputConfig,
        config: resolvedConfig,
      }
    });

    const listenerId = lifecycle.listener.id;
    const postStart = () => {
      const entry = this.listeners.get(listenerId)
      if (entry) entry.status.status = entry.listener.state
    }

    lifecycle.start()
        .then(postStart)
        .catch(postStart);

    return { listenerId, status: this.listeners.get(listenerId)?.listener.state || 'error' }
  }

  /**
   * Signals the listener to stop, emits `stopping` then `stopped` lifecycle events.
   */
  async stopListener(listenerId: string): Promise<void> {
    const entry = this.listeners.get(listenerId)
    if (!entry) return

    const lifecycle = entry.listener;

    await lifecycle.stop();
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
