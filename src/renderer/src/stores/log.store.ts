import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LogEntry } from '@shared/models'

export interface LogFilters {
  debug: boolean
  info: boolean
  warn: boolean
  error: boolean
}

export const useLogStore = defineStore('log', () => {
  const entries = ref<LogEntry[]>([])
  const filters = ref<LogFilters>({ debug: true, info: true, warn: true, error: true })
  const sessionFilter = ref<string | null>(null)

  const filteredEntries = computed(() => {
    return entries.value.filter((entry) => {
      if (!filters.value[entry.level]) return false
      if (sessionFilter.value !== null && entry.sessionId !== sessionFilter.value) return false
      return true
    })
  })

  function addEntry(entry: LogEntry): void {
    entries.value.push(entry)
  }

  function clear(): void {
    entries.value = []
  }

  return { entries, filters, sessionFilter, filteredEntries, addEntry, clear }
})
