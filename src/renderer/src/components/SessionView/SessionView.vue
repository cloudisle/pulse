<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@renderer/stores/session.store'
import { useSystemStore } from '@renderer/stores/system'
import type { SessionEvent } from '../../../../shared/models/session'

const props = defineProps<{
  sessionId: string
}>()

const sessionStore = useSessionStore()
const systemStore = useSystemStore()

// Filters
const directionFilter = ref<'both' | 'sent' | 'received'>('both')
const statusFilter = ref<'all' | 'success' | 'failed' | 'pending'>('all')
const searchQuery = ref('')

// Expandable state
const expandedPayloads = ref<Set<string>>(new Set())
const expandedMetadata = ref<Set<string>>(new Set())

// Listener unsubscribe
let unsubscribe: (() => void) | null = null

onMounted(async () => {
  const systemId = systemStore.selectedSystemId
  if (systemId) {
    await sessionStore.loadSession(systemId, props.sessionId)
  }

  const channels = (window as any).app?.channels
  if (channels?.listeners?.data?.listen) {
    unsubscribe = channels.listeners.data.listen((event: any) => {
      if (event?.sessionEvent) {
        sessionStore.addEvent(event.sessionEvent as SessionEvent)
      }
    })
  }
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
})

async function onRefresh(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (systemId) {
    await sessionStore.loadSession(systemId, props.sessionId)
  }
}

const session = computed(() => sessionStore.activeSession)

const sentCount = computed(
  () => session.value?.events.filter((e) => e.direction === 'sent').length ?? 0
)
const receivedCount = computed(
  () => session.value?.events.filter((e) => e.direction === 'received').length ?? 0
)

const filteredEvents = computed(() => {
  if (!session.value) return []
  let events = [...session.value.events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  if (directionFilter.value !== 'both') {
    events = events.filter((e) => e.direction === directionFilter.value)
  }
  if (statusFilter.value !== 'all') {
    events = events.filter((e) => e.status === statusFilter.value)
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    events = events.filter((e) => {
      const payloadStr = typeof e.payload === 'string' ? e.payload : JSON.stringify(e.payload)
      return payloadStr.toLowerCase().includes(q)
    })
  }
  return events
})

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString()
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

function togglePayload(eventId: string): void {
  if (expandedPayloads.value.has(eventId)) {
    expandedPayloads.value.delete(eventId)
  } else {
    expandedPayloads.value.add(eventId)
  }
}

function toggleMetadata(eventId: string): void {
  if (expandedMetadata.value.has(eventId)) {
    expandedMetadata.value.delete(eventId)
  } else {
    expandedMetadata.value.add(eventId)
  }
}
</script>

<template>
  <div class="session-view" data-testid="session-view">
    <!-- Header -->
    <header class="session-view__header" data-testid="session-header">
      <div class="session-view__header-main">
        <h2 class="session-view__title" data-testid="session-name">
          {{ session?.name ?? session?.id ?? '…' }}
        </h2>
        <button
          class="session-view__btn session-view__btn--secondary"
          data-testid="refresh-btn"
          @click="onRefresh"
        >
          ↻ Refresh
        </button>
      </div>
      <div class="session-view__meta" data-testid="session-meta">
        <span v-if="session" class="session-view__created">
          Created: {{ formatTimestamp(session.createdAt) }}
        </span>
        <span class="session-view__count session-view__count--sent" data-testid="sent-count">
          → {{ sentCount }} sent
        </span>
        <span
          class="session-view__count session-view__count--received"
          data-testid="received-count"
        >
          ← {{ receivedCount }} received
        </span>
      </div>
    </header>

    <!-- Filters toolbar -->
    <div class="session-view__toolbar" data-testid="filters-toolbar">
      <!-- Direction filter -->
      <div class="session-view__filter-group">
        <span class="session-view__filter-label">Direction</span>
        <div class="session-view__btn-group" role="group" aria-label="Direction filter">
          <button
            class="session-view__filter-btn"
            :class="{ 'session-view__filter-btn--active': directionFilter === 'both' }"
            data-testid="filter-direction-both"
            @click="directionFilter = 'both'"
          >Both</button>
          <button
            class="session-view__filter-btn"
            :class="{ 'session-view__filter-btn--active': directionFilter === 'sent' }"
            data-testid="filter-direction-sent"
            @click="directionFilter = 'sent'"
          >Sent</button>
          <button
            class="session-view__filter-btn"
            :class="{ 'session-view__filter-btn--active': directionFilter === 'received' }"
            data-testid="filter-direction-received"
            @click="directionFilter = 'received'"
          >Received</button>
        </div>
      </div>

      <!-- Status filter -->
      <div class="session-view__filter-group">
        <span class="session-view__filter-label">Status</span>
        <div class="session-view__btn-group" role="group" aria-label="Status filter">
          <button
            class="session-view__filter-btn"
            :class="{ 'session-view__filter-btn--active': statusFilter === 'all' }"
            data-testid="filter-status-all"
            @click="statusFilter = 'all'"
          >All</button>
          <button
            class="session-view__filter-btn"
            :class="{ 'session-view__filter-btn--active': statusFilter === 'success' }"
            data-testid="filter-status-success"
            @click="statusFilter = 'success'"
          >Success</button>
          <button
            class="session-view__filter-btn"
            :class="{ 'session-view__filter-btn--active': statusFilter === 'failed' }"
            data-testid="filter-status-failed"
            @click="statusFilter = 'failed'"
          >Failed</button>
          <button
            class="session-view__filter-btn"
            :class="{ 'session-view__filter-btn--active': statusFilter === 'pending' }"
            data-testid="filter-status-pending"
            @click="statusFilter = 'pending'"
          >Pending</button>
        </div>
      </div>

      <!-- Search -->
      <div class="session-view__filter-group session-view__filter-group--grow">
        <input
          v-model="searchQuery"
          class="session-view__search"
          type="text"
          placeholder="Search payloads…"
          data-testid="search-input"
        />
      </div>
    </div>

    <!-- Event timeline -->
    <div class="session-view__timeline" data-testid="event-timeline">
      <div
        v-if="filteredEvents.length === 0"
        class="session-view__empty"
        data-testid="events-empty"
      >
        No events to display.
      </div>

      <div
        v-for="event in filteredEvents"
        :key="event.id"
        class="session-view__event"
        :class="`session-view__event--${event.direction}`"
        :data-testid="`event-row-${event.id}`"
      >
        <!-- Event row header -->
        <div class="session-view__event-header">
          <!-- Direction icon -->
          <span
            class="session-view__direction-icon"
            :class="`session-view__direction-icon--${event.direction}`"
            :data-testid="`direction-icon-${event.id}`"
            :aria-label="event.direction === 'sent' ? 'Sent' : 'Received'"
          >{{ event.direction === 'sent' ? '→' : '←' }}</span>

          <!-- Timestamp -->
          <span class="session-view__timestamp" :data-testid="`timestamp-${event.id}`">
            {{ formatTimestamp(event.timestamp) }}
          </span>

          <!-- Status badge -->
          <span
            class="session-view__status-badge"
            :class="`session-view__status-badge--${event.status}`"
            :data-testid="`status-badge-${event.id}`"
          >{{ event.status }}</span>

          <!-- Sent-specific info -->
          <span v-if="event.direction === 'sent'" class="session-view__event-info" :data-testid="`event-info-${event.id}`">
            <span v-if="event.schemaId" class="session-view__info-item">Schema: {{ event.schemaId }}</span>
            <span v-if="event.inputId" class="session-view__info-item">Input: {{ event.inputId }}</span>
            <span v-if="event.profileIds && event.profileIds.length > 0" class="session-view__info-item">
              Profiles: {{ event.profileIds.join(', ') }}
            </span>
          </span>

          <!-- Received-specific info -->
          <span v-if="event.direction === 'received'" class="session-view__event-info" :data-testid="`event-info-${event.id}`">
            <span v-if="event.outputId" class="session-view__info-item">Output: {{ event.outputId }}</span>
            <span v-if="event.listenerId" class="session-view__info-item">Listener: {{ event.listenerId }}</span>
          </span>

          <!-- Expand buttons -->
          <div class="session-view__event-actions">
            <button
              class="session-view__expand-btn"
              :data-testid="`toggle-payload-${event.id}`"
              @click="togglePayload(event.id)"
            >
              {{ expandedPayloads.has(event.id) ? 'Hide Payload' : 'Payload' }}
            </button>
            <button
              v-if="event.metadata && Object.keys(event.metadata).length > 0"
              class="session-view__expand-btn"
              :data-testid="`toggle-metadata-${event.id}`"
              @click="toggleMetadata(event.id)"
            >
              {{ expandedMetadata.has(event.id) ? 'Hide Metadata' : 'Metadata' }}
            </button>
          </div>
        </div>

        <!-- Error message for failed events -->
        <div
          v-if="event.status === 'failed' && event.error"
          class="session-view__error"
          :data-testid="`event-error-${event.id}`"
        >
          {{ event.error }}
        </div>

        <!-- Expandable payload viewer -->
        <div
          v-if="expandedPayloads.has(event.id)"
          class="session-view__payload"
          :data-testid="`event-payload-${event.id}`"
        >
          <pre class="session-view__json">{{ formatPayload(event.payload) }}</pre>
        </div>

        <!-- Expandable metadata viewer -->
        <div
          v-if="expandedMetadata.has(event.id) && event.metadata"
          class="session-view__metadata"
          :data-testid="`event-metadata-${event.id}`"
        >
          <pre class="session-view__json">{{ JSON.stringify(event.metadata, null, 2) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #cdd6f4;
  font-size: 14px;
}

.session-view__header {
  flex-shrink: 0;
  padding: 0 0 16px 0;
  border-bottom: 1px solid #313244;
  margin-bottom: 16px;
}

.session-view__header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.session-view__title {
  font-size: 20px;
  font-weight: 700;
  color: #cdd6f4;
  margin: 0;
}

.session-view__meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: #a6adc8;
}

.session-view__created {
  color: #585b70;
}

.session-view__count--sent {
  color: #89b4fa;
  font-weight: 600;
}

.session-view__count--received {
  color: #a6e3a1;
  font-weight: 600;
}

.session-view__toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.session-view__filter-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.session-view__filter-group--grow {
  flex: 1;
}

.session-view__filter-label {
  font-size: 12px;
  color: #585b70;
  font-weight: 500;
  flex-shrink: 0;
}

.session-view__btn-group {
  display: flex;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #45475a;
}

.session-view__filter-btn {
  padding: 4px 10px;
  background: #1e1e2e;
  color: #a6adc8;
  border: none;
  font-size: 12px;
  cursor: pointer;
  border-right: 1px solid #45475a;
  transition: background 0.1s ease;
}

.session-view__filter-btn:last-child {
  border-right: none;
}

.session-view__filter-btn:hover {
  background: #313244;
  color: #cdd6f4;
}

.session-view__filter-btn--active {
  background: #313244;
  color: #cdd6f4;
  font-weight: 600;
}

.session-view__search {
  width: 100%;
  padding: 5px 10px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}

.session-view__search:focus {
  border-color: #89b4fa;
}

.session-view__timeline {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-view__empty {
  padding: 32px;
  text-align: center;
  color: #585b70;
  font-style: italic;
}

.session-view__event {
  border: 1px solid #313244;
  border-radius: 6px;
  overflow: hidden;
}

.session-view__event--sent {
  border-left: 3px solid #89b4fa;
}

.session-view__event--received {
  border-left: 3px solid #a6e3a1;
}

.session-view__event-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #181825;
  flex-wrap: wrap;
}

.session-view__direction-icon {
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

.session-view__direction-icon--sent {
  color: #89b4fa;
}

.session-view__direction-icon--received {
  color: #a6e3a1;
}

.session-view__timestamp {
  font-size: 12px;
  color: #585b70;
  flex-shrink: 0;
}

.session-view__status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  flex-shrink: 0;
}

.session-view__status-badge--success {
  background: #1a2a1a;
  color: #a6e3a1;
  border: 1px solid #a6e3a144;
}

.session-view__status-badge--failed {
  background: #2a1520;
  color: #f38ba8;
  border: 1px solid #f38ba844;
}

.session-view__status-badge--pending {
  background: #2a2019;
  color: #f9e2af;
  border: 1px solid #f9e2af44;
}

.session-view__event-info {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.session-view__info-item {
  font-size: 12px;
  color: #a6adc8;
  background: #313244;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.session-view__event-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.session-view__expand-btn {
  padding: 3px 8px;
  background: transparent;
  color: #a6adc8;
  border: 1px solid #45475a;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.1s ease;
  white-space: nowrap;
}

.session-view__expand-btn:hover {
  background: #313244;
  color: #cdd6f4;
}

.session-view__error {
  padding: 8px 12px;
  color: #f38ba8;
  background: #2a1520;
  font-size: 12px;
  border-top: 1px solid #f38ba844;
}

.session-view__payload,
.session-view__metadata {
  padding: 0;
  border-top: 1px solid #313244;
  background: #181825;
}

.session-view__json {
  margin: 0;
  padding: 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #cdd6f4;
  overflow-x: auto;
  white-space: pre;
}

/* Buttons */
.session-view__btn {
  padding: 7px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s ease;
}

.session-view__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.session-view__btn--secondary:hover {
  background: #45475a;
}
</style>
