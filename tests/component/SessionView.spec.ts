import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SessionView from '@renderer/components/SessionView/SessionView.vue'
import { useSessionStore } from '@renderer/stores/session.store'
import { useSystemStore } from '@renderer/stores/system'
import { useUiStore } from '@renderer/stores/ui'
import {SessionDetail, SessionEvent} from "@shared/models";

const SESSION_ID = 'sess-1'
const SYSTEM_ID = 'sys-1'

function makeSentEvent(overrides: Partial<SessionEvent> = {}): SessionEvent {
  return {
    id: 'evt-sent-1',
    sessionId: SESSION_ID,
    direction: 'sent',
    timestamp: '2026-01-01T10:00:00.000Z',
    schemaId: 'sch-1',
    inputId: 'inp-1',
    profileIds: ['prof-1'],
    resources: {
      'sch-1': 'OrderCreated',
      'inp-1': 'Primary Input',
      'prof-1': 'Default Profile'
    },
    payload: JSON.stringify({ key: 'value' }),
    status: 'success',
    ...overrides
  }
}

function makeReceivedEvent(overrides: Partial<SessionEvent> = {}): SessionEvent {
  return {
    id: 'evt-rcv-1',
    sessionId: SESSION_ID,
    direction: 'received',
    timestamp: '2026-01-01T10:00:05.000Z',
    outputId: 'out-1',
    listenerId: 'lsnr-1',
    resources: {
      'out-1': 'Order Stream',
      'lsnr-1': 'Order Stream Listener'
    },
    payload: JSON.stringify({ response: 'ok' }),
    status: 'success',
    ...overrides
  }
}

function makeSession(events: SessionEvent[] = []): SessionDetail {
  return {
    id: SESSION_ID,
    systemId: SYSTEM_ID,
    name: 'Test Session',
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T10:00:10.000Z',
    events,
    logs: []
  }
}

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      sessions: {
        get: vi.fn().mockResolvedValue(makeSession()),
        list: vi.fn().mockResolvedValue([]),
        rename: vi.fn().mockResolvedValue(makeSession()),
        ...overrides.sessions
      },
      ...overrides
    },
    channels: overrides.channels ?? {}
  }
}

function mountComponent(pinia = createPinia(), sessionId = SESSION_ID) {
  const wrapper = mount(SessionView, {
    props: { sessionId },
    global: { plugins: [pinia] }
  })
  return { wrapper, pinia }
}

describe('SessionView component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    mockAppApi()
  })

  // ─── Rendering ─────────────────────────────────────────────────────────────

  it('renders the session view container', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="session-view"]').exists()).toBe(true)
  })

  it('renders the header with session info', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="session-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="session-name"]').exists()).toBe(true)
  })

  it('renders the filters toolbar', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="filters-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="filter-direction-both"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="filter-direction-sent"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="filter-direction-received"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="search-input"]').exists()).toBe(true)
  })

  it('renders the event timeline', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="event-timeline"]').exists()).toBe(true)
  })

  it('renders the refresh button', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="refresh-btn"]').exists()).toBe(true)
  })

  it('renames the session from the title edit icon using popup modal', async () => {
    const renamedSession = {
      ...makeSession(),
      name: 'Renamed Session',
      updatedAt: '2026-01-01T10:10:10.000Z'
    }
    const renameMock = vi.fn().mockResolvedValue(renamedSession)
    mockAppApi({
      sessions: {
        get: vi.fn().mockResolvedValue(makeSession()),
        list: vi.fn().mockResolvedValue([]),
        rename: renameMock
      }
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    const systemStore = useSystemStore()
    const sessionStore = useSessionStore()
    const uiStore = useUiStore()
    systemStore.selectedSystemId = SYSTEM_ID
    sessionStore.activeSession = makeSession()
    uiStore.openTab({ id: `session:${SESSION_ID}`, type: 'session', title: 'Test Session' })

    const { wrapper } = mountComponent(pinia)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="rename-session-btn"]').trigger('click')
    await flushPromises()

    expect(document.body.querySelector('[data-testid="rename-session-modal"]')).not.toBeNull()

    const input = document.body.querySelector('[data-testid="session-rename-input"]') as HTMLInputElement
    expect(input).toBeTruthy()
    input.value = 'Renamed Session'
    input.dispatchEvent(new Event('input'))

    const saveButton = document.body.querySelector('[data-testid="session-rename-save"]') as HTMLButtonElement
    expect(saveButton).toBeTruthy()
    saveButton.click()
    await flushPromises()

    expect(renameMock).toHaveBeenCalledWith(SYSTEM_ID, SESSION_ID, 'Renamed Session')
    expect(uiStore.openTabs.find((t) => t.id === `session:${SESSION_ID}`)?.title).toBe('Renamed Session')
    expect(document.body.querySelector('[data-testid="rename-session-modal"]')).toBeNull()
  })

  // ─── Data loading ───────────────────────────────────────────────────────────

  it('loads session on mount when system is selected', async () => {
    const session = makeSession([makeSentEvent()])
    const getMock = vi.fn().mockResolvedValue(session)
    mockAppApi({ sessions: { get: getMock, list: vi.fn().mockResolvedValue([]) } })

    const pinia = createPinia()
    // Set the system before mounting
    setActivePinia(pinia)
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = SYSTEM_ID

    mountComponent(pinia)
    await flushPromises()

    expect(getMock).toHaveBeenCalledWith(SYSTEM_ID, SESSION_ID)
  })

  it('displays session name in header after loading', async () => {
    const session = makeSession([makeSentEvent()])
    mockAppApi({ sessions: { get: vi.fn().mockResolvedValue(session), list: vi.fn().mockResolvedValue([]) } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = SYSTEM_ID

    // Preload the session in the store
    const sessionStore = useSessionStore()
    sessionStore.activeSession = session

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="session-name"]').text()).toContain('Test Session')
  })

  it('shows sent and received counts', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent(), makeSentEvent({ id: 'evt-sent-2' }), makeReceivedEvent()])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="sent-count"]').text()).toContain('2')
    expect(wrapper.find('[data-testid="received-count"]').text()).toContain('1')
  })

  // ─── Event rendering ────────────────────────────────────────────────────────

  it('renders sent and received events in timeline', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent(), makeReceivedEvent()])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="event-row-evt-sent-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="event-row-evt-rcv-1"]').exists()).toBe(true)
  })

  it('shows direction icon → for sent events', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent()])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="direction-icon-evt-sent-1"]').text()).toBe('→')
  })

  it('shows direction icon ← for received events', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeReceivedEvent()])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="direction-icon-evt-rcv-1"]').text()).toBe('←')
  })

  it('shows status badge for events', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent(), makeReceivedEvent({ id: 'evt-rcv-1', status: 'failed' })])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="status-badge-evt-sent-1"]').text()).toBe('success')
    expect(wrapper.find('[data-testid="status-badge-evt-rcv-1"]').text()).toBe('failed')
  })

  it('shows schema, input and profile names for sent events', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent()])

    await wrapper.vm.$nextTick()
    const info = wrapper.find('[data-testid="event-info-evt-sent-1"]').text()
    expect(info).toContain('OrderCreated')
    expect(info).toContain('Primary Input')
    expect(info).toContain('Default Profile')
  })

  it('shows output and listener names for received events', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeReceivedEvent()])

    await wrapper.vm.$nextTick()
    const info = wrapper.find('[data-testid="event-info-evt-rcv-1"]').text()
    expect(info).toContain('Order Stream')
    expect(info).toContain('Order Stream Listener')
  })

  it('shows error message in red for failed events', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([
      makeSentEvent({ id: 'evt-fail-1', status: 'failed', error: 'Connection refused' })
    ])

    await wrapper.vm.$nextTick()
    const errorEl = wrapper.find('[data-testid="event-error-evt-fail-1"]')
    expect(errorEl.exists()).toBe(true)
    expect(errorEl.text()).toContain('Connection refused')
  })

  it('shows empty message when no events match', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="events-empty"]').exists()).toBe(true)
  })

  // ─── Expandable payload ─────────────────────────────────────────────────────

  it('payload is not visible by default', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent()])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="event-payload-evt-sent-1"]').exists()).toBe(false)
  })

  it('expands payload on toggle button click', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent()])

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="toggle-payload-evt-sent-1"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="event-payload-evt-sent-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="event-payload-evt-sent-1"]').text()).toContain('"key"')
  })

  it('collapses payload on second toggle button click', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent()])

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="toggle-payload-evt-sent-1"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="toggle-payload-evt-sent-1"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="event-payload-evt-sent-1"]').exists()).toBe(false)
  })

  // ─── Filters ────────────────────────────────────────────────────────────────

  it('filters events by direction (sent)', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent(), makeReceivedEvent()])

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="filter-direction-sent"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-row-evt-sent-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="event-row-evt-rcv-1"]').exists()).toBe(false)
  })

  it('filters events by direction (received)', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent(), makeReceivedEvent()])

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="filter-direction-received"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-row-evt-sent-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="event-row-evt-rcv-1"]').exists()).toBe(true)
  })

  it('filters events by status (failed)', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([
      makeSentEvent({ id: 'evt-ok', status: 'success' }),
      makeSentEvent({ id: 'evt-fail', status: 'failed', error: 'err' })
    ])

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="filter-status-failed"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-row-evt-ok"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="event-row-evt-fail"]').exists()).toBe(true)
  })

  it('filters events by search query in payload', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([
      makeSentEvent({ id: 'evt-a', payload: JSON.stringify({ match: 'hello' }) }),
      makeSentEvent({ id: 'evt-b', payload: JSON.stringify({ other: 'world' }) })
    ])

    await wrapper.vm.$nextTick()
    const searchInput = wrapper.find('[data-testid="search-input"]')
    await searchInput.setValue('hello')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-row-evt-a"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="event-row-evt-b"]').exists()).toBe(false)
  })

  it('restores all events when direction filter is set back to both', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([makeSentEvent(), makeReceivedEvent()])

    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="filter-direction-sent"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="filter-direction-both"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-row-evt-sent-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="event-row-evt-rcv-1"]').exists()).toBe(true)
  })

  // ─── Real-time updates ──────────────────────────────────────────────────────

  type Callback = (event: any) => void;

  it('adds new events from listener data channel', async () => {
    let listenerCallback: Callback | null = null;

    (window as any).app = {
      api: {
        sessions: { get: vi.fn().mockResolvedValue(makeSession([])), list: vi.fn().mockResolvedValue([]) }
      },
      channels: {
        listeners: {
          data: {
            listen: vi.fn((cb: (event: any) => void) => {
              listenerCallback = cb
              return () => {}
            })
          }
        }
      }
    }

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const sessionStore = useSessionStore()
    sessionStore.activeSession = makeSession([])

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="events-empty"]').exists()).toBe(true)

    // Simulate a new event from listener
    const newEvent = makeReceivedEvent({ id: 'evt-new' })
    if (listenerCallback) {
      (listenerCallback as Callback)({ sessionEvent: newEvent })
    }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-row-evt-new"]').exists()).toBe(true)
  })

  // ─── Refresh ────────────────────────────────────────────────────────────────

  it('calls loadSession on refresh button click', async () => {
    const getMock = vi.fn().mockResolvedValue(makeSession([]))
    mockAppApi({ sessions: { get: getMock, list: vi.fn().mockResolvedValue([]) } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = SYSTEM_ID

    await wrapper.find('[data-testid="refresh-btn"]').trigger('click')
    await flushPromises()

    expect(getMock).toHaveBeenCalledWith(SYSTEM_ID, SESSION_ID)
  })
})
