import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  ListenerStatus,
  ListenerConfig,
  ListenerStartResult,
  ListenerLifecycleEvent,
  ListenerDataEvent,
  ListenerErrorEvent,
} from '@shared/models/listener'
import type { SessionEvent } from '@shared/models/session'

export const useListenerStore = defineStore('listener', () => {
  const activeListeners = ref<Map<string, ListenerStatus>>(new Map())
  const listenerEvents = ref<Map<string, SessionEvent[]>>(new Map())
  const errors = ref<ListenerErrorEvent[]>([])

  async function startListener(config: ListenerConfig): Promise<ListenerStartResult | null> {
    const api = (window as any).app?.api
    if (!api) return null
    const result: ListenerStartResult = await api.listeners.start(config)
    return result
  }

  async function stopListener(listenerId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    await api.listeners.stop(listenerId)
  }

  async function loadStatus(): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const statuses: ListenerStatus[] = await api.listeners.status()
    const newMap = new Map<string, ListenerStatus>()
    for (const s of statuses) {
      newMap.set(s.listenerId, s)
    }
    activeListeners.value = newMap
  }

  function handleLifecycle(event: ListenerLifecycleEvent): void {
    const existing = activeListeners.value.get(event.listenerId)
    if (existing) {
      existing.status = event.state
      if (event.error) existing.lastError = event.error
    } else {
      activeListeners.value.set(event.listenerId, {
        listenerId: event.listenerId,
        outputId: event.outputId,
        sessionId: event.sessionId,
        status: event.state,
        eventsReceived: 0,
        startedAt: event.timestamp,
      })
    }
    activeListeners.value = new Map(activeListeners.value)
  }

  function handleData(event: ListenerDataEvent): void {
    const existing = activeListeners.value.get(event.listenerId)
    if (existing) {
      existing.eventsReceived++
      existing.lastEventAt = event.event.timestamp
      activeListeners.value = new Map(activeListeners.value)
    }

    const events = listenerEvents.value.get(event.listenerId) ?? []
    events.push(event.event)
    const newMap = new Map(listenerEvents.value)
    newMap.set(event.listenerId, events)
    listenerEvents.value = newMap
  }

  function handleError(event: ListenerErrorEvent): void {
    errors.value = [...errors.value, event]
    const existing = activeListeners.value.get(event.listenerId)
    if (existing) {
      existing.lastError = event.error
      if (!event.recoverable) {
        existing.status = 'error'
      }
      activeListeners.value = new Map(activeListeners.value)
    }
  }

  function clearErrors(): void {
    errors.value = []
  }

  return {
    activeListeners,
    listenerEvents,
    errors,
    startListener,
    stopListener,
    loadStatus,
    handleLifecycle,
    handleData,
    handleError,
    clearErrors,
  }
})
