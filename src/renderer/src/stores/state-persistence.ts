import { watch } from 'vue'
import type { SessionEvent } from '@shared/models/session'
import { useAwsStore } from '@renderer/stores/aws'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useListenerStore } from '@renderer/stores/listener.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useSessionStore } from '@renderer/stores/session.store'
import { useSystemStore } from '@renderer/stores/system'
import { useTemplateStore } from '@renderer/stores/template.store'
import { useUiStore, type Tab } from '@renderer/stores/ui'

const STORAGE_KEY = 'pulse.renderer.state.v1'

interface PersistedRendererState {
  selectedSystemId: string | null
  selectedSessionId: string | null
  selectedEnvironmentId: string | null
  selectedAwsProfile: string | null
  openTabs: Tab[]
  activeTabId: string | null
  listenerEvents: Array<[string, SessionEvent[]]>
  sidebarCollapsed: boolean
  rightSidebarCollapsed: boolean
  rightSidebarWidth: number
  bottomPanelCollapsed: boolean
  bottomPanelHeight: number
}

let initialized = false

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isTab(value: unknown): value is Tab {
  if (!value || typeof value !== 'object') return false
  const tab = value as Record<string, unknown>
  return (
    typeof tab.id === 'string' &&
    typeof tab.type === 'string' &&
    typeof tab.title === 'string'
  )
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isValidNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function readState(): PersistedRendererState | null {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PersistedRendererState>
    const openTabs = Array.isArray(parsed.openTabs) ? parsed.openTabs.filter(isTab) : []
    const listenerEvents = Array.isArray(parsed.listenerEvents)
      ? parsed.listenerEvents.filter((entry): entry is [string, SessionEvent[]] => {
          return Array.isArray(entry) && typeof entry[0] === 'string' && Array.isArray(entry[1])
        })
      : []

    return {
      selectedSystemId: typeof parsed.selectedSystemId === 'string' ? parsed.selectedSystemId : null,
      selectedSessionId: typeof parsed.selectedSessionId === 'string' ? parsed.selectedSessionId : null,
      selectedEnvironmentId: typeof parsed.selectedEnvironmentId === 'string' ? parsed.selectedEnvironmentId : null,
      selectedAwsProfile: typeof parsed.selectedAwsProfile === 'string' ? parsed.selectedAwsProfile : null,
      openTabs,
      activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
      listenerEvents,
      sidebarCollapsed: isBoolean(parsed.sidebarCollapsed) ? parsed.sidebarCollapsed : false,
      rightSidebarCollapsed: isBoolean(parsed.rightSidebarCollapsed)
        ? parsed.rightSidebarCollapsed
        : false,
      rightSidebarWidth: isValidNumberInRange(parsed.rightSidebarWidth, 200, 800)
        ? parsed.rightSidebarWidth
        : 300,
      bottomPanelCollapsed: isBoolean(parsed.bottomPanelCollapsed)
        ? parsed.bottomPanelCollapsed
        : false,
      bottomPanelHeight: isValidNumberInRange(parsed.bottomPanelHeight, 80, 600)
        ? parsed.bottomPanelHeight
        : 200,
    }
  } catch {
    return null
  }
}

function writeState(state: PersistedRendererState): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore persistence failures (quota/security), app still functions.
  }
}

export async function initializeStatePersistence(): Promise<void> {
  if (initialized) return
  initialized = true

  const systemStore = useSystemStore()
  const schemaStore = useSchemaStore()
  const environmentStore = useEnvironmentStore()
  const profileStore = useProfileStore()
  const templateStore = useTemplateStore()
  const sessionStore = useSessionStore()
  const uiStore = useUiStore()
  const listenerStore = useListenerStore()
  const awsStore = useAwsStore()

  await Promise.all([
    systemStore.loadSystems(),
    awsStore.loadProfiles(),
  ])

  const persisted = readState()
  if (persisted) {
    if (persisted.listenerEvents.length > 0) {
      listenerStore.listenerEvents = new Map(persisted.listenerEvents)
    }

    if (persisted.selectedSystemId) {
      const restoredSystem = systemStore.systems.find((s) => s.id === persisted.selectedSystemId)
      if (restoredSystem) {
        systemStore.selectSystem(restoredSystem.id, restoredSystem)
        await Promise.all([
          schemaStore.list(restoredSystem.id),
          environmentStore.list(restoredSystem.id),
          profileStore.list(restoredSystem.id),
          templateStore.list(restoredSystem.id),
          sessionStore.loadSessions(restoredSystem.id),
        ])
      }
    }

    if (
      persisted.selectedSessionId &&
      sessionStore.sessions.some((session) => session.id === persisted.selectedSessionId)
    ) {
      sessionStore.selectSession(persisted.selectedSessionId)
      uiStore.selectSession(persisted.selectedSessionId)
    }

    if (
      persisted.selectedEnvironmentId &&
      environmentStore.environments.some((env) => env.id === persisted.selectedEnvironmentId)
    ) {
      environmentStore.selectEnvironment(persisted.selectedEnvironmentId)
    }

    if (
      persisted.selectedAwsProfile &&
      awsStore.availableProfiles.includes(persisted.selectedAwsProfile)
    ) {
      awsStore.selectProfile(persisted.selectedAwsProfile)
    }

    uiStore.openTabs = persisted.openTabs
    uiStore.activeTabId = persisted.activeTabId
    if (uiStore.activeTabId && !uiStore.openTabs.some((tab) => tab.id === uiStore.activeTabId)) {
      uiStore.activeTabId = uiStore.openTabs[0]?.id ?? null
    }

    uiStore.sidebarCollapsed = persisted.sidebarCollapsed
    uiStore.rightSidebarCollapsed = persisted.rightSidebarCollapsed
    uiStore.rightSidebarWidth = persisted.rightSidebarWidth
    uiStore.bottomPanelCollapsed = persisted.bottomPanelCollapsed
    uiStore.bottomPanelHeight = persisted.bottomPanelHeight
  }

  const persist = (): void => {
    writeState({
      selectedSystemId: systemStore.selectedSystemId,
      selectedSessionId: sessionStore.selectedSessionId,
      selectedEnvironmentId: environmentStore.selectedEnvironmentId,
      selectedAwsProfile: awsStore.selectedProfile,
      openTabs: uiStore.openTabs.map((tab) => ({ id: tab.id, type: tab.type, title: tab.title })),
      activeTabId: uiStore.activeTabId,
      listenerEvents: Array.from(listenerStore.listenerEvents.entries()),
      sidebarCollapsed: uiStore.sidebarCollapsed,
      rightSidebarCollapsed: uiStore.rightSidebarCollapsed,
      rightSidebarWidth: uiStore.rightSidebarWidth,
      bottomPanelCollapsed: uiStore.bottomPanelCollapsed,
      bottomPanelHeight: uiStore.bottomPanelHeight,
    })
  }

  watch(() => systemStore.selectedSystemId, persist)
  watch(() => sessionStore.selectedSessionId, persist)
  watch(() => environmentStore.selectedEnvironmentId, persist)
  watch(() => awsStore.selectedProfile, persist)
  watch(() => uiStore.openTabs, persist, { deep: true })
  watch(() => uiStore.activeTabId, persist)
  watch(() => uiStore.sidebarCollapsed, persist)
  watch(() => uiStore.rightSidebarCollapsed, persist)
  watch(() => uiStore.rightSidebarWidth, persist)
  watch(() => uiStore.bottomPanelCollapsed, persist)
  watch(() => uiStore.bottomPanelHeight, persist)
  watch(() => listenerStore.listenerEvents, persist, { deep: true })
}
