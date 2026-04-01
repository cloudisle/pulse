import type {
  ListenerConfig,
  ListenerFilter,
  ListenerStatus,
  ListenerStartResult,
} from '../../../shared/models'
import type { OutputConfig } from '../../../shared/models'
import type { Environment } from '../../../shared/models'
import {ListenerLifecycleFactory} from "./factory";
import {ListenerLifecycle} from "./listener";
import {VariableReplacementService} from "../variable-replacement.service";
import {logger} from "../../util/log";
import { SessionSentValueIndexService } from './session-sent-value-index.service';

const log = logger('listener-manager.service');

export type ListenerEntry = { listener: ListenerLifecycle, status: ListenerStatus };

export class ListenerManagerService {

  private readonly variables: VariableReplacementService;
  private readonly listeners = new Map<string, ListenerEntry>();

  constructor(
    private readonly factory: ListenerLifecycleFactory,
    private readonly sentValueIndex: SessionSentValueIndexService,
  ) {
    this.variables = new VariableReplacementService();
  }

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
    const effectiveListenerConfig = this.mergeListenerConfig(listenerConfig, outputConfig)

    if (this.shouldHydrateCorrelation(effectiveListenerConfig.filters)) {
      await this.sentValueIndex.hydrateFromSessionStorage(
        effectiveListenerConfig.systemId,
        effectiveListenerConfig.sessionId
      )
    }

    const variables = this.buildVariables(environment)
    const resolvedConfig = this.variables.replaceVariablesInObject(
      outputConfig.config,
      variables
    ) as OutputConfig['config'];
    const resolvedName = this.variables.replaceVariables(outputConfig.name, variables);

    const lifecycle = await this.factory.create({
      listenerConfig: effectiveListenerConfig,
      outputConfig: {
        ...outputConfig,
        name: resolvedName,
        config: resolvedConfig,
      }
    });

    const listenerId = lifecycle.listener.id;
    const startedAt = new Date().toISOString();

    this.listeners.set(listenerId, {
      listener: lifecycle,
      status: {
        listenerId,
        outputId: effectiveListenerConfig.outputId,
        sessionId: effectiveListenerConfig.sessionId,
        status: 'starting',
        eventsReceived: 0,
        startedAt,
      }
    });

    await log.info(`Starting listener ${listenerId} for output ${listenerConfig.outputId}`, {
      sessionId: effectiveListenerConfig.sessionId
    });

    const postStart = () => {
      const entry = this.listeners.get(listenerId)
      if (entry) {
        entry.status.status = entry.listener.state
        if (entry.listener.state === 'error') {
          entry.status.lastError = entry.status.lastError ?? 'Listener failed to start.'
          entry.status.stoppedAt = new Date().toISOString()
        }
      }
    }

    lifecycle.start()
        .then(postStart)
        .catch(postStart);

    return { listenerId, status: this.listeners.get(listenerId)?.status.status || 'error' }
  }

  /**
   * Signals the listener to stop, emits `stopping` then `stopped` lifecycle events.
   */
  async stopListener(listenerId: string): Promise<void> {
    const entry = this.listeners.get(listenerId)
    if (!entry) return

    await log.info(`Stopping listener ${listenerId}`);

    const lifecycle = entry.listener;

    await lifecycle.stop();
    entry.status.status = lifecycle.state
    entry.status.stoppedAt = new Date().toISOString()
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

  private mergeListenerConfig(listenerConfig: ListenerConfig, outputConfig: OutputConfig): ListenerConfig {
    const defaults = outputConfig.listenerDefaults
    const hasOverrideFilters = listenerConfig.filters !== undefined
    const hasOverrideFilterMode = listenerConfig.filterMode !== undefined
    const hasOverrideIncludeUnmatched = listenerConfig.includeUnmatched !== undefined

    return {
      ...listenerConfig,
      filters: hasOverrideFilters ? listenerConfig.filters : defaults?.filters,
      filterMode: hasOverrideFilterMode ? listenerConfig.filterMode : defaults?.filterMode,
      includeUnmatched: hasOverrideIncludeUnmatched
        ? listenerConfig.includeUnmatched
        : defaults?.includeUnmatched
    }
  }

  private shouldHydrateCorrelation(filters?: ListenerFilter[]): boolean {
    return (filters ?? []).some((filter) => {
      if (filter.type !== 'sessionCorrelation') return false
      const config = filter.config as { includeHistoricalSent?: boolean }
      return config.includeHistoricalSent !== false
    })
  }
}
