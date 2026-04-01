import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ListenerPanel from '@renderer/components/Listeners/ListenerPanel.vue'
import { useListenerStore } from '@renderer/stores/listener.store'
import { useSessionStore } from '@renderer/stores/session.store'
import { useSystemStore } from '@renderer/stores/system'
import type { ListenerStatus } from '../../src/shared/models/listener'
import type { SessionEvent } from '../../src/shared/models/session'

function makeStatus(overrides: Partial<ListenerStatus> = {}): ListenerStatus {
  return {
    listenerId: 'listener-1',
    outputId: 'output-1',
    sessionId: 'session-1',
    status: 'running',
    eventsReceived: 0,
    startedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeEvent(overrides: Partial<SessionEvent> = {}): SessionEvent {
  return {
    id: Math.random().toString(36).slice(2),
    sessionId: 'session-1',
    direction: 'received',
    timestamp: new Date().toISOString(),
    payload: '{"type":"test"}',
    status: 'success',
    ...overrides,
  }
}

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      systems: { get: vi.fn().mockResolvedValue({ outputs: [], inputs: [] }) },
      sessions: { list: vi.fn().mockResolvedValue([]) },
      listeners: {
        start: vi.fn().mockResolvedValue({ listenerId: 'new-listener', status: 'starting' }),
        stop: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue([]),
        ...overrides.listeners,
      },
      ...overrides.api,
    },
    channels: {
      listeners: {
        lifecycle: { listen: vi.fn().mockReturnValue(() => {}) },
        data: { listen: vi.fn().mockReturnValue(() => {}) },
        error: { listen: vi.fn().mockReturnValue(() => {}) },
      },
      ...overrides.channels,
    },
  }
}

function mountComponent(pinia = createPinia()) {
  return mount(ListenerPanel, { global: { plugins: [pinia] } })
}

function seedSelectedSession(
  pinia: ReturnType<typeof createPinia>,
  overrides: { systemId?: string; sessionId?: string; sessionName?: string } = {}
) {
  setActivePinia(pinia)
  const systemId = overrides.systemId ?? 'sys-1'
  const sessionId = overrides.sessionId ?? 'session-1'
  const sessionName = overrides.sessionName ?? 'Session One'

  const systemStore = useSystemStore()
  const sessionStore = useSessionStore()

  systemStore.selectedSystemId = systemId
  sessionStore.sessions = [{
    id: sessionId,
    systemId,
    name: sessionName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }]
  sessionStore.selectedSessionId = sessionId
}

describe('ListenerPanel component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
    mockAppApi()
  })

  it('renders a prompt when no session is selected', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Select a session to manage listeners.')
  })

  it('renders one stopped row per configured output', async () => {
    mockAppApi({
      api: {
        systems: {
          get: vi.fn().mockResolvedValue({
            outputs: [
              { id: 'out-1', name: 'Output One', type: 'kinesis', config: {}, contentType: 'json' },
              { id: 'out-2', name: 'Output Two', type: 'sqs', config: {}, contentType: 'json' },
            ],
            inputs: [],
          }),
        },
      },
    })

    const pinia = createPinia()
    seedSelectedSession(pinia)
    const wrapper = mountComponent(pinia)
    await flushPromises()

    expect(wrapper.find('[data-testid="listener-row-out-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="listener-row-out-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="listener-status-out-1"]').text()).toBe('stopped')
    expect(wrapper.find('[data-testid="listener-status-out-2"]').text()).toBe('stopped')
  })

  it('does not auto-start listeners on mount', async () => {
    const mockStart = vi.fn().mockResolvedValue({ listenerId: 'l1', status: 'starting' })
    mockAppApi({
      listeners: { start: mockStart },
      api: {
        systems: {
          get: vi.fn().mockResolvedValue({
            outputs: [{ id: 'out-1', name: 'Output One', type: 'kinesis', config: {}, contentType: 'json' }],
            inputs: [],
          }),
        },
      },
    })

    const pinia = createPinia()
    seedSelectedSession(pinia)
    mountComponent(pinia)
    await flushPromises()

    expect(mockStart).not.toHaveBeenCalled()
  })

  it('starts a configured listener only when its Start button is clicked', async () => {
    const mockStart = vi.fn().mockResolvedValue({ listenerId: 'l1', status: 'starting' })
    mockAppApi({
      listeners: { start: mockStart },
      api: {
        systems: {
          get: vi.fn().mockResolvedValue({
            outputs: [{ id: 'out-1', name: 'Output One', type: 'kinesis', config: {}, contentType: 'json' }],
            inputs: [],
          }),
        },
      },
    })

    const pinia = createPinia()
    seedSelectedSession(pinia, { systemId: 'sys-1', sessionId: 'sess-1' })
    const wrapper = mountComponent(pinia)
    await flushPromises()

    await wrapper.find('[data-testid="start-btn-out-1"]').trigger('click')
    await flushPromises()

    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ outputId: 'out-1', sessionId: 'sess-1' }))
  })

  it('starts all configured listeners only when Start All is clicked', async () => {
    const mockStart = vi.fn().mockResolvedValue({ listenerId: 'l1', status: 'starting' })
    mockAppApi({
      listeners: { start: mockStart },
      api: {
        systems: {
          get: vi.fn().mockResolvedValue({
            outputs: [
              { id: 'out-1', name: 'Output One', type: 'kinesis', config: {}, contentType: 'json' },
              { id: 'out-2', name: 'Output Two', type: 'sqs', config: {}, contentType: 'json' },
            ],
            inputs: [],
          }),
        },
      },
    })

    const pinia = createPinia()
    seedSelectedSession(pinia, { sessionId: 'sess-1' })
    const wrapper = mountComponent(pinia)
    await flushPromises()

    const startAllButton = wrapper.findAll('button').find((button) => button.text().includes('Start All'))
    expect(startAllButton?.exists()).toBe(true)

    await startAllButton!.trigger('click')
    await flushPromises()

    expect(mockStart).toHaveBeenCalledTimes(2)
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ outputId: 'out-1', sessionId: 'sess-1' }))
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ outputId: 'out-2', sessionId: 'sess-1' }))
  })

  it('stops a running listener from its row Stop button', async () => {
    const mockStop = vi.fn().mockResolvedValue(undefined)
    mockAppApi({
      listeners: { stop: mockStop },
      api: {
        systems: {
          get: vi.fn().mockResolvedValue({
            outputs: [{ id: 'out-1', name: 'Output One', type: 'kinesis', config: {}, contentType: 'json' }],
            inputs: [],
          }),
        },
      },
    })

    const pinia = createPinia()
    seedSelectedSession(pinia)
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    await flushPromises()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', outputId: 'out-1', status: 'running' }))
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="stop-btn-out-1"]').trigger('click')
    await flushPromises()

    expect(mockStop).toHaveBeenCalledWith('l1')
  })

  it('stops all running listeners in the selected session when Stop All is clicked', async () => {
    const mockStop = vi.fn().mockResolvedValue(undefined)
    mockAppApi({
      listeners: { stop: mockStop },
      api: {
        systems: {
          get: vi.fn().mockResolvedValue({
            outputs: [
              { id: 'out-1', name: 'Output One', type: 'kinesis', config: {}, contentType: 'json' },
              { id: 'out-2', name: 'Output Two', type: 'sqs', config: {}, contentType: 'json' },
            ],
            inputs: [],
          }),
        },
      },
    })

    const pinia = createPinia()
    seedSelectedSession(pinia, { sessionId: 'session-1', sessionName: 'Session One' })
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    await flushPromises()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', outputId: 'out-1', sessionId: 'session-1', status: 'running' }))
    store.activeListeners.set('l2', makeStatus({ listenerId: 'l2', outputId: 'out-2', sessionId: 'session-1', status: 'running' }))
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    const stopAllButton = wrapper.findAll('button').find((button) => button.text().includes('Stop All'))
    expect(stopAllButton?.exists()).toBe(true)

    await stopAllButton!.trigger('click')
    await flushPromises()

    expect(mockStop).toHaveBeenCalledWith('l1')
    expect(mockStop).toHaveBeenCalledWith('l2')
  })

  it('shows event stream for a selected running listener row', async () => {
    mockAppApi({
      api: {
        systems: {
          get: vi.fn().mockResolvedValue({
            outputs: [{ id: 'out-1', name: 'Output One', type: 'kinesis', config: {}, contentType: 'json' }],
            inputs: [],
          }),
        },
      },
    })

    const pinia = createPinia()
    seedSelectedSession(pinia)
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    await flushPromises()

    const evt = makeEvent({ id: 'evt-1' })
    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', outputId: 'out-1' }))
    store.activeListeners = new Map(store.activeListeners)
    store.listenerEvents.set('l1', [evt])
    store.listenerEvents = new Map(store.listenerEvents)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="listener-row-out-1"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-stream"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="event-row-evt-1"]').exists()).toBe(true)
  })

  it('subscribes and unsubscribes listener channels', async () => {
    const unsubLifecycle = vi.fn()
    const unsubData = vi.fn()
    const unsubError = vi.fn()

    ;(window as any).app.channels.listeners.lifecycle.listen = vi.fn().mockReturnValue(unsubLifecycle)
    ;(window as any).app.channels.listeners.data.listen = vi.fn().mockReturnValue(unsubData)
    ;(window as any).app.channels.listeners.error.listen = vi.fn().mockReturnValue(unsubError)

    const wrapper = mountComponent()
    await flushPromises()

    expect((window as any).app.channels.listeners.lifecycle.listen).toHaveBeenCalledTimes(1)
    expect((window as any).app.channels.listeners.data.listen).toHaveBeenCalledTimes(1)
    expect((window as any).app.channels.listeners.error.listen).toHaveBeenCalledTimes(1)

    wrapper.unmount()

    expect(unsubLifecycle).toHaveBeenCalledTimes(1)
    expect(unsubData).toHaveBeenCalledTimes(1)
    expect(unsubError).toHaveBeenCalledTimes(1)
  })
})
