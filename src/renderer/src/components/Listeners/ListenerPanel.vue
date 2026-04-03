<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useListenerStore } from '@renderer/stores/listener.store'
import { useSystemStore } from '@renderer/stores/system'
import { useSessionStore } from '@renderer/stores/session.store'
import { useEnvironmentStore } from '@renderer/stores/environment'
import type { OutputConfig, ListenerFilterMode, ListenerLifecycleState, ListenerStatus } from '../../../../shared/models'
import { resolveCloudSettings } from '@renderer/util/cloud'

const listenerStore = useListenerStore()
const systemStore = useSystemStore()
const sessionStore = useSessionStore()
const environmentStore = useEnvironmentStore()

let unsubLifecycle: (() => void) | null = null
let unsubData: (() => void) | null = null
let unsubError: (() => void) | null = null

const outputs = ref<OutputConfig[]>([])
const outputOverrides = ref<Record<string, {
  sentPath: string
  receivedPath: string
  filterMode: ListenerFilterMode
  includeHistoricalSent: boolean
  includeUnmatched: boolean
}>>({})
const bulkStarting = ref(false)
const startingOutputIds = ref<Set<string>>(new Set())

// Selected listener for event stream
const selectedListenerId = ref<string | null>(null)

// Error notifications
const errorNotification = ref<string | null>(null)
let errorTimeout: ReturnType<typeof setTimeout> | null = null

// Expanded events
const expandedEvents = ref<Set<string>>(new Set())

interface SidebarListenerRow {
  key: string
  outputId: string
  listenerId: string | null
  status: ListenerLifecycleState
  eventsReceived: number
  startedAt?: string
}

// Track listeners tied to the current session
const activeSessionListeners = computed(() => {
  if (!sessionStore.selectedSessionId) return []
  return Array.from(listenerStore.activeListeners.values()).filter(
    (l) => l.sessionId === sessionStore.selectedSessionId
  )
})

function statusPriority(status: ListenerLifecycleState): number {
  switch (status) {
    case 'running': return 5
    case 'starting': return 4
    case 'stopping': return 3
    case 'error': return 2
    case 'stopped': return 1
    default: return 0
  }
}

function pickPreferredListener(current: ListenerStatus, next: ListenerStatus): ListenerStatus {
  const currentPriority = statusPriority(current.status)
  const nextPriority = statusPriority(next.status)
  if (nextPriority > currentPriority) return next
  if (nextPriority < currentPriority) return current

  const currentStartedAt = current.startedAt ?? ''
  const nextStartedAt = next.startedAt ?? ''
  return nextStartedAt > currentStartedAt ? next : current
}

const activeListenersByOutput = computed(() => {
  const byOutput = new Map<string, ListenerStatus>()

  for (const listener of activeSessionListeners.value) {
    const existing = byOutput.get(listener.outputId)
    if (!existing) {
      byOutput.set(listener.outputId, listener)
      continue
    }
    byOutput.set(listener.outputId, pickPreferredListener(existing, listener))
  }

  return byOutput
})

const configuredListeners = computed<SidebarListenerRow[]>(() => {
  return outputs.value.map((output) => {
    const active = activeListenersByOutput.value.get(output.id)
    return {
      key: output.id,
      outputId: output.id,
      listenerId: active?.listenerId ?? null,
      status: active?.status ?? 'stopped',
      eventsReceived: active?.eventsReceived ?? 0,
      startedAt: active?.startedAt,
    }
  })
})

// Check if all session listeners are running
const allListenersRunning = computed(() => {
  if (configuredListeners.value.length === 0) return false
  return configuredListeners.value.every((l) => l.status === 'running')
})

// Check if any session listeners are running
const anyListenerRunning = computed(() => {
  return configuredListeners.value.some((l) => l.status === 'running' || l.status === 'starting')
})

async function loadOutputs(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return
  try {
    const system = await api.systems.get(systemId)
    outputs.value = system.outputs ?? []
    outputOverrides.value = Object.fromEntries(
      outputs.value.map((output) => {
        const correlation = (output.listenerDefaults?.filters ?? []).find((f) => f.type === 'sessionCorrelation')
        const correlationConfig = correlation?.config as {
          sentPath?: string
          receivedPath?: string
          includeHistoricalSent?: boolean
        } | undefined

        return [output.id, {
          sentPath: correlationConfig?.sentPath ?? '$.id',
          receivedPath: correlationConfig?.receivedPath ?? '$.eventId',
          filterMode: output.listenerDefaults?.filterMode ?? 'all',
          includeHistoricalSent: correlationConfig?.includeHistoricalSent !== false,
          includeUnmatched: output.listenerDefaults?.includeUnmatched ?? false,
        }]
      })
    )
  } catch {
    outputs.value = []
    outputOverrides.value = {}
  }
}

function subscribeChannels(): void {
  const channels = (window as any).app?.channels
  if (!channels?.listeners) return

  if (channels.listeners.lifecycle?.listen) {
    unsubLifecycle = channels.listeners.lifecycle.listen((event: any) => {
      listenerStore.handleLifecycle(event)
    })
  }
  if (channels.listeners.data?.listen) {
    unsubData = channels.listeners.data.listen((event: any) => {
      listenerStore.handleData(event)
    })
  }
  if (channels.listeners.error?.listen) {
    unsubError = channels.listeners.error.listen((event: any) => {
      listenerStore.handleError(event)
      if (errorTimeout) clearTimeout(errorTimeout)
      errorNotification.value = event.error
      errorTimeout = setTimeout(() => {
        errorNotification.value = null
      }, 5000)
    })
  }
}

onMounted(async () => {
  await loadOutputs()
  await listenerStore.loadStatus()
  subscribeChannels()
})

onUnmounted(() => {
  if (unsubLifecycle) { unsubLifecycle(); unsubLifecycle = null }
  if (unsubData) { unsubData(); unsubData = null }
  if (unsubError) { unsubError(); unsubError = null }
  if (errorTimeout) { clearTimeout(errorTimeout); errorTimeout = null }
})

watch(() => systemStore.selectedSystemId, async () => {
  await loadOutputs()
})

watch(configuredListeners, () => {
  if (!selectedListenerId.value) return
  const stillExists = configuredListeners.value.some((listener) => listener.listenerId === selectedListenerId.value)
  if (!stillExists) {
    selectedListenerId.value = null
  }
})

function getOutputName(outputId: string): string {
  const output = outputs.value.find((o) => o.id === outputId)
  return output?.name ?? outputId
}

function setOutputStarting(outputId: string, starting: boolean): void {
  if (starting) {
    startingOutputIds.value.add(outputId)
  } else {
    startingOutputIds.value.delete(outputId)
  }
  startingOutputIds.value = new Set(startingOutputIds.value)
}

async function onStartListener(outputId: string): Promise<void> {
  if (startingOutputIds.value.has(outputId)) {
    return
  }
  if (!sessionStore.selectedSessionId) {
    errorNotification.value = 'Select a session first.'
    return
  }
  const systemId = systemStore.selectedSystemId
  if (!systemId) {
    errorNotification.value = 'No system selected.'
    return
  }
  setOutputStarting(outputId, true)

  try {
    const override = outputOverrides.value[outputId] ?? {
      sentPath: '$.id',
      receivedPath: '$.eventId',
      filterMode: 'all' as ListenerFilterMode,
      includeHistoricalSent: true,
      includeUnmatched: false,
    }

    await listenerStore.startListener({
      systemId,
      outputId,
      sessionId: sessionStore.selectedSessionId,
      environmentId: environmentStore.selectedEnvironmentId ?? undefined,
      cloud: resolveCloudSettings(),
      filterMode: override.filterMode,
      includeUnmatched: override.includeUnmatched,
      filters: [
        {
          type: 'sessionCorrelation',
          config: {
            sentPath: override.sentPath,
            receivedPath: override.receivedPath,
            includeHistoricalSent: override.includeHistoricalSent,
          }
        }
      ]
    })

    // Reload to immediately reflect listener ids/status without waiting for lifecycle events.
    await listenerStore.loadStatus()
  } catch (err: any) {
    errorNotification.value = err?.message ?? 'Failed to start listener.'
  } finally {
    setOutputStarting(outputId, false)
  }
}

async function onStopListener(listenerId: string): Promise<void> {
  await listenerStore.stopListener(listenerId)
}

async function onStopAllListeners(): Promise<void> {
  for (const listener of activeSessionListeners.value) {
    if (listener.status === 'stopped' || listener.status === 'error') continue
    await listenerStore.stopListener(listener.listenerId)
  }
}

async function onStartAllListeners(): Promise<void> {
  bulkStarting.value = true
  try {
    for (const listener of configuredListeners.value) {
      if (listener.status !== 'running' && listener.status !== 'starting') {
        await onStartListener(listener.outputId)
      }
    }
  } finally {
    bulkStarting.value = false
  }
}

function selectListener(listenerId: string): void {
  selectedListenerId.value = selectedListenerId.value === listenerId ? null : listenerId
}

const selectedListenerEvents = computed(() => {
  if (!selectedListenerId.value) return []
  return listenerStore.listenerEvents.get(selectedListenerId.value) ?? []
})

function toggleEventExpand(eventId: string): void {
  if (expandedEvents.value.has(eventId)) {
    expandedEvents.value.delete(eventId)
  } else {
    expandedEvents.value.add(eventId)
  }
  expandedEvents.value = new Set(expandedEvents.value)
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return ts
  }
}

function formatPayload(payload: string | Record<string, any>): string {
  try {
    const obj = typeof payload === 'string' ? JSON.parse(payload) : payload
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(payload)
  }
}

function getPayloadPreview(payload: string | Record<string, any>): string {
  const str = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return str.length > 100 ? str.slice(0, 100) + '…' : str
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'running': return 'listener-panel__badge--running'
    case 'starting': return 'listener-panel__badge--starting'
    case 'stopping': return 'listener-panel__badge--stopping'
    case 'stopped': return 'listener-panel__badge--stopped'
    case 'error': return 'listener-panel__badge--error'
    default: return ''
  }
}
</script>

<template>
  <div class="listener-panel">
    <!-- Error notification -->
    <div
      v-if="errorNotification"
      class="listener-panel__error-notification"
      data-testid="error-notification"
    >
      ⚠ {{ errorNotification }}
    </div>

    <!-- Session info and master controls -->
    <div v-if="sessionStore.selectedSessionId" class="listener-panel__session-header">
      <div class="listener-panel__session-controls">
        <button
          class="listener-panel__btn listener-panel__btn--primary"
          title="Start all listeners for this session"
          :disabled="allListenersRunning || configuredListeners.length === 0 || bulkStarting"
          @click="onStartAllListeners"
        >▶ Start All</button>
        <button
          class="listener-panel__btn listener-panel__btn--danger"
          title="Stop all listeners for this session"
          :disabled="!anyListenerRunning"
          @click="onStopAllListeners"
        >⏹ Stop All</button>
      </div>
    </div>

    <!-- No session selected -->
    <div v-else class="listener-panel__no-session">
      <p>Select a session to manage listeners.</p>
    </div>

    <!-- Active listeners section -->
    <div v-if="sessionStore.selectedSessionId" class="listener-panel__section">
      <div class="listener-panel__section-header">
        <span class="listener-panel__section-title">Listeners ({{ configuredListeners.length }})</span>
      </div>

      <div
        v-if="configuredListeners.length === 0"
        class="listener-panel__empty"
        data-testid="listeners-empty"
      >
        No configured listener outputs.
      </div>

      <div
        v-for="listener in configuredListeners"
        :key="listener.key"
        class="listener-panel__listener-row"
        :class="{ 'listener-panel__listener-row--selected': listener.listenerId && selectedListenerId === listener.listenerId }"
        :data-testid="`listener-row-${listener.key}`"
        @click="listener.listenerId ? selectListener(listener.listenerId) : null"
      >
        <span
          class="listener-panel__listener-output"
          :data-testid="`listener-output-${listener.key}`"
        >{{ getOutputName(listener.outputId) }}</span>
        <span
          class="listener-panel__badge"
          :class="statusBadgeClass(listener.status)"
          :data-testid="`listener-status-${listener.key}`"
        >{{ listener.status }}</span>
        <span
          class="listener-panel__events-count"
          :data-testid="`listener-events-${listener.key}`"
        >{{ listener.eventsReceived }} events</span>
        <span v-if="listener.startedAt" class="listener-panel__start-time">
          {{ formatTimestamp(listener.startedAt) }}
        </span>
        <button
          v-if="listener.listenerId && (listener.status === 'running' || listener.status === 'starting' || listener.status === 'stopping')"
          class="listener-panel__btn listener-panel__btn--danger"
          :data-testid="`stop-btn-${listener.key}`"
          :disabled="listener.status === 'stopping'"
          @click.stop="onStopListener(listener.listenerId)"
        >Stop</button>
        <button
          v-else
          class="listener-panel__btn listener-panel__btn--primary"
          :data-testid="`start-btn-${listener.key}`"
          :disabled="startingOutputIds.has(listener.outputId) || bulkStarting"
          @click.stop="onStartListener(listener.outputId)"
        >{{ startingOutputIds.has(listener.outputId) ? 'Starting…' : 'Start' }}</button>

        <div class="listener-panel__overrides" @click.stop>
          <select
            v-model="outputOverrides[listener.outputId].filterMode"
            class="listener-panel__select listener-panel__select--small"
            :data-testid="`filter-mode-${listener.outputId}`"
          >
            <option value="all">all</option>
            <option value="any">any</option>
          </select>
          <input
            v-model="outputOverrides[listener.outputId].sentPath"
            class="listener-panel__input"
            :data-testid="`sent-path-${listener.outputId}`"
            type="text"
            placeholder="sent path ($.id)"
          />
          <input
            v-model="outputOverrides[listener.outputId].receivedPath"
            class="listener-panel__input"
            :data-testid="`received-path-${listener.outputId}`"
            type="text"
            placeholder="received path ($.eventId)"
          />
          <label class="listener-panel__toggle-label listener-panel__toggle-label--sm">
            <input v-model="outputOverrides[listener.outputId].includeHistoricalSent" type="checkbox" />
            History
          </label>
        </div>
      </div>
    </div>

    <!-- Event stream for selected listener -->
    <div
      v-if="selectedListenerId"
      class="listener-panel__event-stream"
      data-testid="event-stream"
    >
      <div class="listener-panel__stream-header">
        <span class="listener-panel__section-title">
          Events — {{ getOutputName(listenerStore.activeListeners.get(selectedListenerId)?.outputId ?? '') }}
        </span>
        <button
          class="listener-panel__btn listener-panel__btn--ghost"
          data-testid="close-stream-btn"
          @click="selectedListenerId = null"
        >×</button>
      </div>

      <div
        v-if="selectedListenerEvents.length === 0"
        class="listener-panel__empty"
        data-testid="events-empty"
      >
        No events yet.
      </div>

      <div
        v-for="event in selectedListenerEvents"
        :key="event.id"
        class="listener-panel__event-row"
        :data-testid="`event-row-${event.id}`"
        @click="toggleEventExpand(event.id)"
      >
        <span class="listener-panel__event-ts">{{ formatTimestamp(event.timestamp) }}</span>
        <span class="listener-panel__event-preview">{{ getPayloadPreview(event.payload) }}</span>
        <div
          v-if="expandedEvents.has(event.id)"
          class="listener-panel__event-payload"
          :data-testid="`event-payload-${event.id}`"
        >
          <pre class="listener-panel__event-json">{{ formatPayload(event.payload) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.listener-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #cdd6f4;
  font-size: 12px;
  overflow-y: auto;
  gap: 8px;
}

.listener-panel__error-notification {
  padding: 6px 10px;
  background: #2a1520;
  border: 1px solid #f38ba844;
  border-radius: 4px;
  color: #f38ba8;
  font-size: 12px;
  flex-shrink: 0;
}

.listener-panel__session-header {
  display: flex;
  justify-content: center;
  padding: 8px 10px;
  background: #262838;
  border: 1px solid #3b3e52;
  border-radius: 4px;
  flex-shrink: 0;
}


.listener-panel__session-controls {
  display: flex;
  gap: 8px;
  width: 100%;
}

.listener-panel__session-controls .listener-panel__btn {
  flex: 1;
}


.listener-panel__no-session {
  padding: 20px 12px;
  text-align: center;
  color: #585b70;
  font-size: 13px;
  font-style: italic;
}

.listener-panel__section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.listener-panel__section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.listener-panel__section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #585b70;
  flex: 1;
}

.listener-panel__empty {
  font-size: 11px;
  color: #585b70;
  font-style: italic;
}

.listener-panel__listener-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 4px;
  background: #1e1e2e;
  border: 1px solid #313244;
  cursor: pointer;
  flex-wrap: wrap;
}

.listener-panel__listener-row:hover {
  border-color: #45475a;
}

.listener-panel__listener-row--selected {
  border-color: #89b4fa;
  background: #1a2030;
}

.listener-panel__listener-output {
  font-weight: 500;
  color: #cdd6f4;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.listener-panel__badge {
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}

.listener-panel__badge--running { background: #1a2a1a; color: #a6e3a1; border: 1px solid #a6e3a144; }
.listener-panel__badge--starting { background: #1a2030; color: #89b4fa; border: 1px solid #89b4fa44; }
.listener-panel__badge--stopping { background: #2a2019; color: #f9e2af; border: 1px solid #f9e2af44; }
.listener-panel__badge--stopped { background: #1e1e2e; color: #585b70; border: 1px solid #45475a; }
.listener-panel__badge--error { background: #2a1520; color: #f38ba8; border: 1px solid #f38ba844; }

.listener-panel__events-count {
  font-size: 11px;
  color: #a6adc8;
  flex-shrink: 0;
}

.listener-panel__start-time {
  font-size: 11px;
  color: #585b70;
  flex-shrink: 0;
}

.listener-panel__overrides {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding-top: 4px;
  border-top: 1px solid #313244;
}

/* Form */
.listener-panel__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 6px;
}

.listener-panel__form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.listener-panel__label {
  font-size: 11px;
  color: #a6adc8;
  font-weight: 500;
}

.listener-panel__select {
  padding: 4px 6px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.listener-panel__select:focus {
  border-color: #89b4fa;
}

.listener-panel__select--small {
  padding: 3px 4px;
  font-size: 11px;
}

.listener-panel__input {
  padding: 4px 6px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  flex: 1;
  min-width: 0;
}

.listener-panel__input:focus {
  border-color: #89b4fa;
}

.listener-panel__input--small {
  max-width: 60px;
}

.listener-panel__filters-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.listener-panel__filter-mode-group {
  display: flex;
  border: 1px solid #45475a;
  border-radius: 4px;
  overflow: hidden;
}

.listener-panel__mode-btn {
  padding: 2px 8px;
  background: #1e1e2e;
  color: #a6adc8;
  border: none;
  font-size: 11px;
  cursor: pointer;
  border-right: 1px solid #45475a;
}

.listener-panel__mode-btn:last-child {
  border-right: none;
}

.listener-panel__mode-btn--active {
  background: #313244;
  color: #cdd6f4;
  font-weight: 600;
}

.listener-panel__toggle-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #a6adc8;
  cursor: pointer;
  user-select: none;
}

.listener-panel__toggle-label--sm {
  flex-shrink: 0;
}

.listener-panel__filter-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px 0;
  border-top: 1px solid #313244;
}

.listener-panel__form-error {
  color: #f38ba8;
  font-size: 12px;
  margin: 0;
  padding: 4px 8px;
  background: #2a1520;
  border: 1px solid #f38ba844;
  border-radius: 4px;
}

/* Buttons */
.listener-panel__btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s ease;
  flex-shrink: 0;
}

.listener-panel__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.listener-panel__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.listener-panel__btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.listener-panel__btn--ghost {
  background: transparent;
  color: #a6adc8;
  border-color: transparent;
  padding: 2px 6px;
  font-size: 11px;
}

.listener-panel__btn--ghost:hover:not(:disabled) {
  background: #313244;
  color: #cdd6f4;
}

.listener-panel__btn--danger {
  background: transparent;
  color: #f38ba8;
  border-color: #45475a;
  padding: 3px 8px;
  font-size: 11px;
}

.listener-panel__btn--danger:hover:not(:disabled) {
  background: #2a1520;
  border-color: #f38ba8;
}

.listener-panel__btn--icon-danger {
  background: transparent;
  color: #f38ba8;
  border: none;
  padding: 2px 6px;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
}

.listener-panel__btn--icon-danger:hover {
  color: #f38ba8;
  background: #2a1520;
  border-radius: 4px;
}

/* Event stream */
.listener-panel__event-stream {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 1px solid #313244;
  padding-top: 8px;
}

.listener-panel__stream-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.listener-panel__event-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 8px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 4px;
  cursor: pointer;
}

.listener-panel__event-row:hover {
  border-color: #45475a;
}

.listener-panel__event-ts {
  font-size: 10px;
  color: #585b70;
  flex-shrink: 0;
  font-family: monospace;
}

.listener-panel__event-preview {
  font-size: 11px;
  color: #a6adc8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
}

.listener-panel__event-payload {
  border-top: 1px solid #313244;
  margin-top: 4px;
  padding-top: 4px;
}

.listener-panel__event-json {
  margin: 0;
  font-size: 11px;
  color: #cdd6f4;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
</style>
