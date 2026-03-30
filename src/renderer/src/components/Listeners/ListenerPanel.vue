<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, toRaw} from 'vue'
import { useListenerStore } from '@renderer/stores/listener.store'
import { useSystemStore } from '@renderer/stores/system'
import { useSessionStore } from '@renderer/stores/session.store'
import { useEnvironmentStore } from '@renderer/stores/environment'
import type { OutputConfig } from '../../../../shared/models/system'
import type {
  ListenerFilterMode,
  ListenerFilterType,
  JsonPathFilterConfig,
  RegexFilterConfig,
} from '../../../../shared/models/listener'
import {resolveCloudSettings} from "@renderer/util/cloud";

interface LocalFilter {
  _id: string
  type: ListenerFilterType
  enabled: boolean
  config: JsonPathFilterConfig | RegexFilterConfig
}

const listenerStore = useListenerStore()
const systemStore = useSystemStore()
const sessionStore = useSessionStore()
const environmentStore = useEnvironmentStore()

let unsubLifecycle: (() => void) | null = null
let unsubData: (() => void) | null = null
let unsubError: (() => void) | null = null

const outputs = ref<OutputConfig[]>([])

// Form state
const showForm = ref(false)
const formOutputId = ref('')
const formSessionId = ref('')
const formFilterMode = ref<ListenerFilterMode>('all')
const formIncludeUnmatched = ref(false)
const formFilters = ref<LocalFilter[]>([])
const formError = ref('')
const formStarting = ref(false)

// Selected listener for event stream
const selectedListenerId = ref<string | null>(null)

// Error notifications
const errorNotification = ref<string | null>(null)
let errorTimeout: ReturnType<typeof setTimeout> | null = null

// Expanded events
const expandedEvents = ref<Set<string>>(new Set())

async function loadOutputs(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return
  try {
    const system = await api.systems.get(systemId)
    outputs.value = system.outputs ?? []
  } catch {
    outputs.value = []
  }
}

async function loadSessions(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  await sessionStore.loadSessions(systemId)
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
  await Promise.all([loadOutputs(), loadSessions()])
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
  await Promise.all([loadOutputs(), loadSessions()])
})

const activeListenersList = computed(() =>
  Array.from(listenerStore.activeListeners.values())
)

function getOutputName(outputId: string): string {
  const output = outputs.value.find((o) => o.id === outputId)
  return output?.name ?? outputId
}

function addFilter(): void {
  formFilters.value.push({
    _id: Math.random().toString(36).slice(2),
    type: 'jsonpath',
    enabled: true,
    config: { path: '', operator: 'equals', value: '' } as JsonPathFilterConfig,
  })
}

function removeFilter(idx: number): void {
  formFilters.value.splice(idx, 1)
}

function setFilterType(idx: number, type: ListenerFilterType): void {
  const f = formFilters.value[idx]
  if (!f) return
  f.type = type
  if (type === 'jsonpath') {
    f.config = { path: '', operator: 'equals', value: '' } as JsonPathFilterConfig
  } else {
    f.config = { pattern: '', flags: '', targetPath: '' } as RegexFilterConfig
  }
}

function isJsonPathConfig(config: JsonPathFilterConfig | RegexFilterConfig): config is JsonPathFilterConfig {
  return 'path' in config
}

function isRegexConfig(config: JsonPathFilterConfig | RegexFilterConfig): config is RegexFilterConfig {
  return 'pattern' in config
}

async function onStartListener(): Promise<void> {
  if (!formOutputId.value) {
    formError.value = 'Select an output first.'
    return
  }
  if (!formSessionId.value) {
    formError.value = 'Select a session first.'
    return
  }
  const systemId = systemStore.selectedSystemId
  if (!systemId) {
    formError.value = 'No system selected.'
    return
  }

  formError.value = ''
  formStarting.value = true

  try {
    const filters = formFilters.value.map(({ _id, ...f }) => f)

    await listenerStore.startListener({
      systemId,
      outputId: formOutputId.value,
      sessionId: formSessionId.value,
      environmentId: environmentStore.selectedEnvironmentId ?? undefined,
      filters: filters.length > 0 ? filters : undefined,
      filterMode: formFilterMode.value,
      includeUnmatched: formIncludeUnmatched.value,
      cloud: toRaw(resolveCloudSettings()),
    })

    showForm.value = false
    formOutputId.value = ''
    formSessionId.value = ''
    formFilterMode.value = 'all'
    formIncludeUnmatched.value = false
    formFilters.value = []
  } catch (err: any) {
    formError.value = err?.message ?? 'Failed to start listener.'
  } finally {
    formStarting.value = false
  }
}

async function onStopListener(listenerId: string): Promise<void> {
  await listenerStore.stopListener(listenerId)
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

    <!-- Active listeners section -->
    <div class="listener-panel__section">
      <div class="listener-panel__section-header">
        <span class="listener-panel__section-title">Active Listeners</span>
        <button
          class="listener-panel__btn listener-panel__btn--ghost"
          data-testid="toggle-start-form"
          @click="showForm = !showForm"
        >{{ showForm ? '× Cancel' : '+ New Listener' }}</button>
      </div>

      <div
        v-if="activeListenersList.length === 0"
        class="listener-panel__empty"
        data-testid="listeners-empty"
      >
        No active listeners.
      </div>

      <div
        v-for="listener in activeListenersList"
        :key="listener.listenerId"
        class="listener-panel__listener-row"
        :class="{ 'listener-panel__listener-row--selected': selectedListenerId === listener.listenerId }"
        :data-testid="`listener-row-${listener.listenerId}`"
        @click="selectListener(listener.listenerId)"
      >
        <span
          class="listener-panel__listener-output"
          :data-testid="`listener-output-${listener.listenerId}`"
        >{{ getOutputName(listener.outputId) }}</span>
        <span
          class="listener-panel__badge"
          :class="statusBadgeClass(listener.status)"
          :data-testid="`listener-status-${listener.listenerId}`"
        >{{ listener.status }}</span>
        <span
          class="listener-panel__events-count"
          :data-testid="`listener-events-${listener.listenerId}`"
        >{{ listener.eventsReceived }} events</span>
        <span v-if="listener.startedAt" class="listener-panel__start-time">
          {{ formatTimestamp(listener.startedAt) }}
        </span>
        <button
          class="listener-panel__btn listener-panel__btn--danger"
          :data-testid="`stop-btn-${listener.listenerId}`"
          :disabled="listener.status === 'stopped' || listener.status === 'stopping' || listener.status === 'error'"
          @click.stop="onStopListener(listener.listenerId)"
        >Stop</button>
      </div>
    </div>

    <!-- Start listener form -->
    <div v-if="showForm" class="listener-panel__form" data-testid="start-form">
      <div class="listener-panel__form-field">
        <label class="listener-panel__label">Output</label>
        <select
          class="listener-panel__select"
          :value="formOutputId"
          data-testid="output-select"
          @change="formOutputId = ($event.target as HTMLSelectElement).value"
        >
          <option value="" disabled>Select an output…</option>
          <option v-for="output in outputs" :key="output.id" :value="output.id">
            {{ output.name }} ({{ output.type }})
          </option>
        </select>
      </div>

      <div class="listener-panel__form-field">
        <label class="listener-panel__label">Session</label>
        <select
          class="listener-panel__select"
          :value="formSessionId"
          data-testid="session-select"
          @change="formSessionId = ($event.target as HTMLSelectElement).value"
        >
          <option value="" disabled>Select a session…</option>
          <option
            v-for="session in sessionStore.sessions"
            :key="session.id"
            :value="session.id"
          >{{ session.name ?? session.id }}</option>
        </select>
      </div>

      <!-- Filters section -->
      <div class="listener-panel__form-field">
        <div class="listener-panel__filters-header">
          <span class="listener-panel__label">Filters</span>
          <div class="listener-panel__filter-mode-group">
            <button
              class="listener-panel__mode-btn"
              :class="{ 'listener-panel__mode-btn--active': formFilterMode === 'all' }"
              data-testid="filter-mode-all"
              @click="formFilterMode = 'all'"
            >All</button>
            <button
              class="listener-panel__mode-btn"
              :class="{ 'listener-panel__mode-btn--active': formFilterMode === 'any' }"
              data-testid="filter-mode-any"
              @click="formFilterMode = 'any'"
            >Any</button>
          </div>
          <label class="listener-panel__toggle-label">
            <input
              type="checkbox"
              :checked="formIncludeUnmatched"
              data-testid="include-unmatched"
              @change="formIncludeUnmatched = ($event.target as HTMLInputElement).checked"
            />
            Include unmatched
          </label>
          <button
            class="listener-panel__btn listener-panel__btn--ghost"
            data-testid="add-filter-btn"
            @click="addFilter"
          >+ Add Filter</button>
        </div>

        <div
          v-for="(filter, idx) in formFilters"
          :key="filter._id"
          class="listener-panel__filter-row"
          :data-testid="`filter-row-${idx}`"
        >
          <select
            class="listener-panel__select listener-panel__select--small"
            :value="filter.type"
            :data-testid="`filter-type-${idx}`"
            @change="setFilterType(idx, ($event.target as HTMLSelectElement).value as ListenerFilterType)"
          >
            <option value="jsonpath">JSONPath</option>
            <option value="regex">Regex</option>
          </select>

          <!-- JSONPath filter fields -->
          <template v-if="filter.type === 'jsonpath' && isJsonPathConfig(filter.config)">
            <input
              class="listener-panel__input"
              placeholder="$.path"
              :value="filter.config.path"
              :data-testid="`filter-path-${idx}`"
              @input="(filter.config as JsonPathFilterConfig).path = ($event.target as HTMLInputElement).value"
            />
            <select
              class="listener-panel__select listener-panel__select--small"
              :value="filter.config.operator"
              :data-testid="`filter-operator-${idx}`"
              @change="(filter.config as JsonPathFilterConfig).operator = ($event.target as HTMLSelectElement).value as any"
            >
              <option value="equals">equals</option>
              <option value="notEquals">not equals</option>
              <option value="contains">contains</option>
              <option value="exists">exists</option>
            </select>
            <input
              v-if="filter.config.operator !== 'exists'"
              class="listener-panel__input"
              placeholder="value"
              :value="filter.config.value"
              :data-testid="`filter-value-${idx}`"
              @input="(filter.config as JsonPathFilterConfig).value = ($event.target as HTMLInputElement).value"
            />
          </template>

          <!-- Regex filter fields -->
          <template v-else-if="filter.type === 'regex' && isRegexConfig(filter.config)">
            <input
              class="listener-panel__input"
              placeholder="pattern"
              :value="filter.config.pattern"
              :data-testid="`filter-pattern-${idx}`"
              @input="(filter.config as RegexFilterConfig).pattern = ($event.target as HTMLInputElement).value"
            />
            <input
              class="listener-panel__input listener-panel__input--small"
              placeholder="flags (e.g. i)"
              :value="filter.config.flags"
              :data-testid="`filter-flags-${idx}`"
              @input="(filter.config as RegexFilterConfig).flags = ($event.target as HTMLInputElement).value"
            />
            <input
              class="listener-panel__input"
              placeholder="target path (optional)"
              :value="filter.config.targetPath"
              :data-testid="`filter-target-${idx}`"
              @input="(filter.config as RegexFilterConfig).targetPath = ($event.target as HTMLInputElement).value"
            />
          </template>

          <label class="listener-panel__toggle-label listener-panel__toggle-label--sm">
            <input
              type="checkbox"
              :checked="filter.enabled"
              :data-testid="`filter-enabled-${idx}`"
              @change="filter.enabled = ($event.target as HTMLInputElement).checked"
            />
            On
          </label>
          <button
            class="listener-panel__btn listener-panel__btn--icon-danger"
            :data-testid="`filter-delete-${idx}`"
            @click="removeFilter(idx)"
          >×</button>
        </div>
      </div>

      <p
        v-if="formError"
        class="listener-panel__form-error"
        data-testid="form-error"
      >{{ formError }}</p>

      <button
        class="listener-panel__btn listener-panel__btn--primary"
        :disabled="formStarting"
        data-testid="start-btn"
        @click="onStartListener"
      >{{ formStarting ? 'Starting…' : 'Start Listener' }}</button>
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
