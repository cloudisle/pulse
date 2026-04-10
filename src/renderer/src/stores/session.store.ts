import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Session, SessionDetail, SessionEvent } from '@shared/models/session'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const activeSession = ref<SessionDetail | null>(null)
  const selectedSessionId = ref<string | null>(null)

  const selectedSession = computed(() => {
    if (!selectedSessionId.value) return null
    return sessions.value.find((s) => s.id === selectedSessionId.value) ?? null
  })

  async function loadSessions(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const items: Session[] = await api.sessions.list(systemId)
    sessions.value = items
  }

  async function loadSession(systemId: string, id: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const detail: SessionDetail = await api.sessions.get(systemId, id)
    activeSession.value = detail
  }

  async function createSession(systemId: string): Promise<Session | null> {
    const api = (window as any).app?.api
    if (!api) return null
    const created: Session = await api.sessions.create(systemId)
    sessions.value = [created, ...sessions.value.filter((s) => s.id !== created.id)]
    selectedSessionId.value = created.id
    return created
  }

  async function renameSession(systemId: string, sessionId: string, name: string): Promise<Session | null> {
    const api = (window as any).app?.api
    if (!api) return null
    const renamed: Session = await api.sessions.rename(systemId, sessionId, name)
    sessions.value = sessions.value.map((s) => (s.id === sessionId ? renamed : s))
    if (activeSession.value?.id === sessionId) {
      activeSession.value = { ...activeSession.value, name: renamed.name, updatedAt: renamed.updatedAt }
    }
    return renamed
  }

  async function deleteSession(systemId: string, sessionId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    await api.sessions.delete(systemId, sessionId)
    sessions.value = sessions.value.filter((s) => s.id !== sessionId)
    if (selectedSessionId.value === sessionId) {
      selectedSessionId.value = null
    }
    if (activeSession.value?.id === sessionId) {
      activeSession.value = null
    }
  }

  function selectSession(sessionId: string | null): void {
    selectedSessionId.value = sessionId
  }

  function addEvent(event: SessionEvent): void {
    if (activeSession.value && activeSession.value.id === event.sessionId) {
      activeSession.value.events.push(event)
    }
  }

  function reset(): void {
    sessions.value = []
    activeSession.value = null
    selectedSessionId.value = null
  }

  return {
    sessions,
    activeSession,
    selectedSessionId,
    selectedSession,
    loadSessions,
    loadSession,
    createSession,
    renameSession,
    deleteSession,
    selectSession,
    addEvent,
    reset
  }
})
