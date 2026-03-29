import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ListenerPanel from '@renderer/components/Listeners/ListenerPanel.vue'
import { useListenerStore } from '@renderer/stores/listener.store'
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

describe('ListenerPanel component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  it('renders empty state when no listeners', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="listeners-empty"]').exists()).toBe(true)
  })

  it('shows New Listener button', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="toggle-start-form"]').exists()).toBe(true)
  })

  it('toggles start form on button click', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.find('[data-testid="start-form"]').exists()).toBe(false)
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')
    expect(wrapper.find('[data-testid="start-form"]').exists()).toBe(true)
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')
    expect(wrapper.find('[data-testid="start-form"]').exists()).toBe(false)
  })

  it('start form has output and session selectors', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')
    expect(wrapper.find('[data-testid="output-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="session-select"]').exists()).toBe(true)
  })

  it('shows validation error when start is clicked without output', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')
    await wrapper.find('[data-testid="start-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="form-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="form-error"]').text()).toContain('output')
  })

  it('calls api.listeners.start when form is submitted with valid data', async () => {
    const mockStart = vi.fn().mockResolvedValue({ listenerId: 'l1', status: 'starting' })
    mockAppApi({ listeners: { start: mockStart, stop: vi.fn(), status: vi.fn().mockResolvedValue([]) } })

    const pinia = createPinia()
    const wrapper = mountComponent(pinia)

    const sessionsApi = vi.fn().mockResolvedValue([{ id: 'sess-1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), systemId: 'sys-1' }])
    const systemsApi = vi.fn().mockResolvedValue({
      outputs: [{ id: 'out-1', name: 'My Output', type: 'kinesis', config: {}, contentType: 'json' }],
      inputs: [],
    })
    ;(window as any).app.api.sessions.list = sessionsApi
    ;(window as any).app.api.systems.get = systemsApi

    // Set the selected system so validation passes
    const { useSystemStore } = await import('@renderer/stores/system')
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'

    await flushPromises()
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')
    await flushPromises()

    // Select output
    const outputSelect = wrapper.find('[data-testid="output-select"]')
    await outputSelect.setValue('out-1')

    // Select session
    const sessionSelect = wrapper.find('[data-testid="session-select"]')
    await sessionSelect.setValue('sess-1')

    await wrapper.find('[data-testid="start-btn"]').trigger('click')
    await flushPromises()

    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ outputId: 'out-1', sessionId: 'sess-1' })
    )
    // Form should be hidden after successful start
    expect(wrapper.find('[data-testid="start-form"]').exists()).toBe(false)
  })

  it('shows active listeners from store', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', outputId: 'out-1', status: 'running' }))
    store.activeListeners = new Map(store.activeListeners)

    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="listener-row-l1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="listener-status-l1"]').text()).toBe('running')
  })

  it('shows correct status badge class for each state', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    const states = ['running', 'starting', 'stopping', 'stopped', 'error'] as const
    for (const status of states) {
      store.activeListeners.set(status, makeStatus({ listenerId: status, status }))
    }
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    for (const status of states) {
      const badge = wrapper.find(`[data-testid="listener-status-${status}"]`)
      expect(badge.classes()).toContain(`listener-panel__badge--${status}`)
    }
  })

  it('calls api.listeners.stop when stop button is clicked', async () => {
    const mockStop = vi.fn().mockResolvedValue(undefined)
    ;(window as any).app.api.listeners.stop = mockStop

    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', status: 'running' }))
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="stop-btn-l1"]').trigger('click')
    await flushPromises()
    expect(mockStop).toHaveBeenCalledWith('l1')
  })

  it('stop button is disabled when listener is stopped', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', status: 'stopped' }))
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    const stopBtn = wrapper.find('[data-testid="stop-btn-l1"]')
    expect(stopBtn.attributes('disabled')).toBeDefined()
  })

  it('shows event stream when listener row is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1' }))
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-stream"]').exists()).toBe(false)
    await wrapper.find('[data-testid="listener-row-l1"]').trigger('click')
    expect(wrapper.find('[data-testid="event-stream"]').exists()).toBe(true)
  })

  it('shows events in the stream for selected listener', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    const evt = makeEvent({ id: 'evt-1' })
    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1' }))
    store.activeListeners = new Map(store.activeListeners)
    store.listenerEvents.set('l1', [evt])
    store.listenerEvents = new Map(store.listenerEvents)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="listener-row-l1"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-row-evt-1"]').exists()).toBe(true)
  })

  it('expands event payload on click', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    const evt = makeEvent({ id: 'evt-1', payload: '{"hello":"world"}' })
    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1' }))
    store.activeListeners = new Map(store.activeListeners)
    store.listenerEvents.set('l1', [evt])
    store.listenerEvents = new Map(store.listenerEvents)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="listener-row-l1"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="event-payload-evt-1"]').exists()).toBe(false)
    await wrapper.find('[data-testid="event-row-evt-1"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="event-payload-evt-1"]').exists()).toBe(true)
  })

  it('closes event stream when × button is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1' }))
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="listener-row-l1"]').trigger('click')
    expect(wrapper.find('[data-testid="event-stream"]').exists()).toBe(true)

    await wrapper.find('[data-testid="close-stream-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="event-stream"]').exists()).toBe(false)
  })

  it('subscribes to lifecycle channel on mount', async () => {
    const lifecycleListen = vi.fn().mockReturnValue(() => {})
    ;(window as any).app.channels.listeners.lifecycle.listen = lifecycleListen

    mountComponent()
    await flushPromises()
    expect(lifecycleListen).toHaveBeenCalledTimes(1)
  })

  it('subscribes to data channel on mount', async () => {
    const dataListen = vi.fn().mockReturnValue(() => {})
    ;(window as any).app.channels.listeners.data.listen = dataListen

    mountComponent()
    await flushPromises()
    expect(dataListen).toHaveBeenCalledTimes(1)
  })

  it('subscribes to error channel on mount', async () => {
    const errorListen = vi.fn().mockReturnValue(() => {})
    ;(window as any).app.channels.listeners.error.listen = errorListen

    mountComponent()
    await flushPromises()
    expect(errorListen).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes from all channels on unmount', async () => {
    const unsubLifecycle = vi.fn()
    const unsubData = vi.fn()
    const unsubError = vi.fn()
    ;(window as any).app.channels.listeners.lifecycle.listen = vi.fn().mockReturnValue(unsubLifecycle)
    ;(window as any).app.channels.listeners.data.listen = vi.fn().mockReturnValue(unsubData)
    ;(window as any).app.channels.listeners.error.listen = vi.fn().mockReturnValue(unsubError)

    const wrapper = mountComponent()
    await flushPromises()
    wrapper.unmount()

    expect(unsubLifecycle).toHaveBeenCalledTimes(1)
    expect(unsubData).toHaveBeenCalledTimes(1)
    expect(unsubError).toHaveBeenCalledTimes(1)
  })

  it('updates listener status when lifecycle event received', async () => {
    let lifecycleCallback: ((event: any) => void) | null = null
    ;(window as any).app.channels.listeners.lifecycle.listen = vi.fn().mockImplementation((cb: any) => {
      lifecycleCallback = cb
      return () => {}
    })

    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()
    await flushPromises()

    expect(lifecycleCallback).not.toBeNull()
    lifecycleCallback!({
      listenerId: 'l1',
      outputId: 'out-1',
      sessionId: 'sess-1',
      state: 'running',
      timestamp: new Date().toISOString(),
    })
    await wrapper.vm.$nextTick()

    expect(store.activeListeners.get('l1')?.status).toBe('running')
  })

  it('appends events when data event received', async () => {
    let dataCallback: ((event: any) => void) | null = null
    ;(window as any).app.channels.listeners.data.listen = vi.fn().mockImplementation((cb: any) => {
      dataCallback = cb
      return () => {}
    })

    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    await flushPromises()

    // Add listener AFTER flushPromises so loadStatus() doesn't clear it
    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', eventsReceived: 0 }))
    store.activeListeners = new Map(store.activeListeners)

    expect(dataCallback).not.toBeNull()
    const newEvent = makeEvent({ id: 'evt-new' })
    dataCallback!({ listenerId: 'l1', sessionId: 'sess-1', event: newEvent })
    await wrapper.vm.$nextTick()

    expect(store.listenerEvents.get('l1')).toHaveLength(1)
    expect(store.activeListeners.get('l1')?.eventsReceived).toBe(1)
  })

  it('shows error notification when error event received', async () => {
    let errorCallback: ((event: any) => void) | null = null
    ;(window as any).app.channels.listeners.error.listen = vi.fn().mockImplementation((cb: any) => {
      errorCallback = cb
      return () => {}
    })

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="error-notification"]').exists()).toBe(false)
    errorCallback!({ listenerId: 'l1', error: 'Connection failed', timestamp: new Date().toISOString() })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="error-notification"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-notification"]').text()).toContain('Connection failed')
  })

  it('add filter button adds a filter row to the form', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')

    expect(wrapper.find('[data-testid="filter-row-0"]').exists()).toBe(false)
    await wrapper.find('[data-testid="add-filter-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="filter-row-0"]').exists()).toBe(true)
  })

  it('delete button removes a filter row', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')
    await wrapper.find('[data-testid="add-filter-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="filter-row-0"]').exists()).toBe(true)
    await wrapper.find('[data-testid="filter-delete-0"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="filter-row-0"]').exists()).toBe(false)
  })

  it('switching filter type from jsonpath to regex changes fields', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')
    await wrapper.find('[data-testid="add-filter-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Default is jsonpath
    expect(wrapper.find('[data-testid="filter-path-0"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="filter-pattern-0"]').exists()).toBe(false)

    // Switch to regex
    await wrapper.find('[data-testid="filter-type-0"]').setValue('regex')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="filter-path-0"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="filter-pattern-0"]').exists()).toBe(true)
  })

  it('filter mode buttons toggle between all and any', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.find('[data-testid="toggle-start-form"]').trigger('click')

    expect(wrapper.find('[data-testid="filter-mode-all"]').classes()).toContain('listener-panel__mode-btn--active')
    await wrapper.find('[data-testid="filter-mode-any"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="filter-mode-any"]').classes()).toContain('listener-panel__mode-btn--active')
    expect(wrapper.find('[data-testid="filter-mode-all"]').classes()).not.toContain('listener-panel__mode-btn--active')
  })

  it('shows events count for active listener', async () => {
    const pinia = createPinia()
    const wrapper = mountComponent(pinia)
    const store = useListenerStore()

    store.activeListeners.set('l1', makeStatus({ listenerId: 'l1', eventsReceived: 5 }))
    store.activeListeners = new Map(store.activeListeners)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="listener-events-l1"]').text()).toContain('5')
  })
})
