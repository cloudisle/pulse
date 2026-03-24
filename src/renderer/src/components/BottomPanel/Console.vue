<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useLogStore } from '@renderer/stores/log.store'
import type { LogEntry } from '../../../../shared/models'

const logStore = useLogStore()

const scrollContainer = ref<HTMLElement | null>(null)
const isUserScrolledUp = ref(false)
const expandedEntries = ref<Set<string>>(new Set())

const sessions = computed<string[]>(() => {
  const ids = logStore.entries
    .map((e) => e.sessionId)
    .filter((id): id is string => id !== undefined && id !== null)
  return [...new Set(ids)]
})

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    const sss = String(d.getMilliseconds()).padStart(3, '0')
    return `${hh}:${mm}:${ss}.${sss}`
  } catch {
    return iso
  }
}

function toggleExpanded(id: string): void {
  if (expandedEntries.value.has(id)) {
    expandedEntries.value.delete(id)
  } else {
    expandedEntries.value.add(id)
  }
}

function hasMetadata(entry: LogEntry): boolean {
  return entry.metadata !== undefined && Object.keys(entry.metadata).length > 0
}

function onScroll(): void {
  const el = scrollContainer.value
  if (!el) return
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4
  isUserScrolledUp.value = !atBottom
}

async function scrollToBottom(): Promise<void> {
  await nextTick()
  const el = scrollContainer.value
  if (el) {
    el.scrollTop = el.scrollHeight
  }
}

watch(
  () => logStore.filteredEntries.length,
  () => {
    if (!isUserScrolledUp.value) {
      scrollToBottom()
    }
  }
)

let unsubscribe: (() => void) | null = null

onMounted(() => {
  const channels = (window as any).app?.channels
  if (channels?.log?.entry?.listen) {
    unsubscribe = channels.log.entry.listen((entry: LogEntry) => {
      logStore.addEntry(entry)
    })
  }
  scrollToBottom()
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
})
</script>

<template>
  <div class="console">
    <div class="console__toolbar">
      <div class="console__filters">
        <button
          class="console__level-toggle console__level-toggle--debug"
          :class="{ 'console__level-toggle--active': logStore.filters.debug }"
          @click="logStore.filters.debug = !logStore.filters.debug"
        >DEBUG</button>
        <button
          class="console__level-toggle console__level-toggle--info"
          :class="{ 'console__level-toggle--active': logStore.filters.info }"
          @click="logStore.filters.info = !logStore.filters.info"
        >INFO</button>
        <button
          class="console__level-toggle console__level-toggle--warn"
          :class="{ 'console__level-toggle--active': logStore.filters.warn }"
          @click="logStore.filters.warn = !logStore.filters.warn"
        >WARN</button>
        <button
          class="console__level-toggle console__level-toggle--error"
          :class="{ 'console__level-toggle--active': logStore.filters.error }"
          @click="logStore.filters.error = !logStore.filters.error"
        >ERROR</button>
      </div>
      <select
        class="console__session-filter"
        :value="logStore.sessionFilter ?? ''"
        @change="logStore.sessionFilter = ($event.target as HTMLSelectElement).value || null"
      >
        <option value="">All sessions</option>
        <option v-for="sid in sessions" :key="sid" :value="sid">{{ sid }}</option>
      </select>
      <button class="console__clear-btn" @click="logStore.clear()">Clear</button>
    </div>

    <div
      ref="scrollContainer"
      class="console__list"
      @scroll="onScroll"
    >
      <div
        v-for="entry in logStore.filteredEntries"
        :key="entry.id"
        class="console__entry"
        :class="`console__entry--${entry.level}`"
        @click="hasMetadata(entry) ? toggleExpanded(entry.id) : undefined"
      >
        <span class="console__timestamp">{{ formatTimestamp(entry.timestamp) }}</span>
        <span class="console__level" :class="`console__level--${entry.level}`">{{ entry.level }}</span>
        <span class="console__source">{{ entry.source }}</span>
        <span class="console__message">{{ entry.message }}</span>
        <div
          v-if="hasMetadata(entry) && expandedEntries.has(entry.id)"
          class="console__metadata"
        >
          <pre>{{ JSON.stringify(entry.metadata, null, 2) }}</pre>
        </div>
      </div>

      <div v-if="logStore.filteredEntries.length === 0" class="console__empty">
        No log entries.
      </div>
    </div>
  </div>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.console__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.console__filters {
  display: flex;
  gap: 4px;
}

.console__level-toggle {
  padding: 2px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  background: #313244;
  color: #6c7086;
  opacity: 0.5;
}

.console__level-toggle--active {
  opacity: 1;
}

.console__level-toggle--debug { color: #a6adc8; }
.console__level-toggle--info  { color: #89b4fa; }
.console__level-toggle--warn  { color: #f9e2af; }
.console__level-toggle--error { color: #f38ba8; }

.console__level-toggle:hover {
  border-color: #45475a;
}

.console__session-filter {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  font-size: 11px;
  border-radius: 4px;
  padding: 2px 4px;
  cursor: pointer;
}

.console__clear-btn {
  margin-left: auto;
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  font-size: 11px;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
}

.console__clear-btn:hover {
  background: #45475a;
}

.console__list {
  flex: 1;
  overflow-y: auto;
  font-family: 'Fira Code', 'Cascadia Code', monospace, sans-serif;
  font-size: 11px;
}

.console__entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 4px;
  border-radius: 2px;
  flex-wrap: wrap;
  cursor: default;
}

.console__entry:hover {
  background: #1e1e2e;
}

.console__entry--error { background: rgba(243, 139, 168, 0.05); }
.console__entry--warn  { background: rgba(249, 226, 175, 0.05); }

.console__timestamp {
  color: #585b70;
  flex-shrink: 0;
  white-space: nowrap;
}

.console__level {
  font-weight: 700;
  font-size: 10px;
  flex-shrink: 0;
  white-space: nowrap;
  padding: 0 4px;
  border-radius: 3px;
}

.console__level--debug { color: #a6adc8; background: rgba(166, 173, 200, 0.1); }
.console__level--info  { color: #89b4fa; background: rgba(137, 180, 250, 0.1); }
.console__level--warn  { color: #f9e2af; background: rgba(249, 226, 175, 0.1); }
.console__level--error { color: #f38ba8; background: rgba(243, 139, 168, 0.1); }

.console__source {
  color: #a6e3a1;
  font-size: 10px;
  flex-shrink: 0;
  padding: 0 4px;
  background: rgba(166, 227, 161, 0.1);
  border-radius: 3px;
  white-space: nowrap;
}

.console__message {
  color: #cdd6f4;
  flex: 1;
  word-break: break-word;
}

.console__metadata {
  width: 100%;
  margin-top: 2px;
  padding: 4px 8px;
  background: #181825;
  border-radius: 4px;
  border: 1px solid #313244;
}

.console__metadata pre {
  margin: 0;
  font-size: 10px;
  color: #a6adc8;
  white-space: pre-wrap;
  word-break: break-all;
}

.console__empty {
  font-size: 12px;
  color: #585b70;
  font-style: italic;
  padding: 8px 4px;
}
</style>
