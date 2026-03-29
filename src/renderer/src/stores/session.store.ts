import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Session, SessionDetail, SessionEvent } from '../../../shared/models/session'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const activeSession = ref<SessionDetail | null>(null)

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

  function addEvent(event: SessionEvent): void {
    if (activeSession.value && activeSession.value.id === event.sessionId) {
      activeSession.value.events.push(event)
    }
  }

  function reset(): void {
    sessions.value = []
    activeSession.value = null
  }

  return { sessions, activeSession, loadSessions, loadSession, addEvent, reset }
})
