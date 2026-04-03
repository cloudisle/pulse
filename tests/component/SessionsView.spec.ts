import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SessionsView from '@renderer/components/SessionView/SessionsView.vue'
import { useSessionStore } from '@renderer/stores/session.store'
import { useSystemStore } from '@renderer/stores/system'
import { useUiStore } from '@renderer/stores/ui'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      sessions: {
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
        ...overrides.sessions
      },
      ...overrides.api
    }
  }
}

describe('SessionsView component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    mockAppApi()
  })

  it('shows a hint when no system is selected', async () => {
    const wrapper = mount(SessionsView, { global: { plugins: [createPinia()] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Please select a system from the sidebar to view sessions.')
    expect(wrapper.find('[data-testid="sessions-table"]').exists()).toBe(false)
  })

  it('renders sessions in a table when a system is selected', async () => {
    const listMock = vi.fn().mockResolvedValue([
      {
        id: 'sess-1',
        systemId: 'sys-1',
        name: 'Session One',
        createdAt: '2026-03-30T10:00:00.000Z',
        updatedAt: '2026-03-30T11:00:00.000Z'
      }
    ])
    mockAppApi({ sessions: { list: listMock } })

    const pinia = createPinia()
    setActivePinia(pinia)
    const systemStore = useSystemStore()

    systemStore.selectedSystemId = 'sys-1'

    const wrapper = mount(SessionsView, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(listMock).toHaveBeenCalledWith('sys-1')
    expect(wrapper.find('[data-testid="sessions-table"]').exists()).toBe(true)
    expect(wrapper.findAll('tbody tr')).toHaveLength(1)
    expect(wrapper.text()).toContain('Session One')
    expect(wrapper.text()).toContain('sess-1')
  })

  it('does not change active session when a table row is clicked', async () => {
    mockAppApi({
      sessions: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'sess-1',
            systemId: 'sys-1',
            name: 'Session One',
            createdAt: '2026-03-30T10:00:00.000Z',
            updatedAt: '2026-03-30T11:00:00.000Z'
          }
        ])
      }
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    const systemStore = useSystemStore()
    const sessionStore = useSessionStore()
    const uiStore = useUiStore()

    systemStore.selectedSystemId = 'sys-1'
    sessionStore.selectSession('sess-existing')
    uiStore.selectSession('sess-existing')

    const wrapper = mount(SessionsView, { global: { plugins: [pinia] } })
    await flushPromises()

    await wrapper.find('tbody tr').trigger('click')

    expect(sessionStore.selectedSessionId).toBe('sess-existing')
    expect(uiStore.selectedSessionId).toBe('sess-existing')
  })

  it('opens the session detail tab from the View Details button', async () => {
    mockAppApi({
      sessions: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'sess-1',
            systemId: 'sys-1',
            name: 'Session One',
            createdAt: '2026-03-30T10:00:00.000Z',
            updatedAt: '2026-03-30T11:00:00.000Z'
          }
        ])
      }
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    const systemStore = useSystemStore()
    const sessionStore = useSessionStore()
    const uiStore = useUiStore()

    systemStore.selectedSystemId = 'sys-1'
    sessionStore.selectSession('sess-existing')
    uiStore.selectSession('sess-existing')

    const wrapper = mount(SessionsView, { global: { plugins: [pinia] } })
    await flushPromises()

    await wrapper.find('tbody tr button').trigger('click')

    expect(uiStore.openTabs).toContainEqual(
      expect.objectContaining({ id: 'session:sess-1', type: 'session', title: 'Session One' })
    )
    expect(uiStore.activeTabId).toBe('session:sess-1')
    expect(sessionStore.selectedSessionId).toBe('sess-existing')
    expect(uiStore.selectedSessionId).toBe('sess-existing')
  })

  it('preserves the selected session when refreshing the sessions list', async () => {
    mockAppApi({
      sessions: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'sess-1',
            systemId: 'sys-1',
            name: 'Session One',
            createdAt: '2026-03-30T10:00:00.000Z',
            updatedAt: '2026-03-30T11:00:00.000Z'
          }
        ])
      }
    })

    const pinia = createPinia()
    setActivePinia(pinia)
    const systemStore = useSystemStore()
    const sessionStore = useSessionStore()

    systemStore.selectedSystemId = 'sys-1'
    sessionStore.selectSession('sess-1')

    mount(SessionsView, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(sessionStore.selectedSessionId).toBe('sess-1')
  })

  it('does not show inline rename controls in the actions column', async () => {
    mockAppApi({
      sessions: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'sess-1',
            systemId: 'sys-1',
            name: 'Session One',
            createdAt: '2026-03-30T10:00:00.000Z',
            updatedAt: '2026-03-30T11:00:00.000Z'
          }
        ])
      }
    })
    const pinia = createPinia()
    setActivePinia(pinia)
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'

    const wrapper = mount(SessionsView, { global: { plugins: [pinia] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="rename-session-sess-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="save-session-sess-1"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="cancel-rename-session-sess-1"]').exists()).toBe(false)
  })

  it('deletes a session from the actions column', async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined)
    mockAppApi({
      sessions: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'sess-1',
            systemId: 'sys-1',
            name: 'Session One',
            createdAt: '2026-03-30T10:00:00.000Z',
            updatedAt: '2026-03-30T11:00:00.000Z'
          }
        ]),
        delete: deleteMock
      }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const pinia = createPinia()
    setActivePinia(pinia)
    const systemStore = useSystemStore()
    const sessionStore = useSessionStore()
    const uiStore = useUiStore()
    systemStore.selectedSystemId = 'sys-1'

    const wrapper = mount(SessionsView, { global: { plugins: [pinia] } })
    await flushPromises()

    sessionStore.selectSession('sess-1')
    uiStore.selectSession('sess-1')
    uiStore.openTab({ id: 'session:sess-1', type: 'session', title: 'Session One' })

    await wrapper.find('[data-testid="delete-session-sess-1"]').trigger('click')
    await flushPromises()

    expect(deleteMock).toHaveBeenCalledWith('sys-1', 'sess-1')
    expect(sessionStore.sessions.find((s) => s.id === 'sess-1')).toBeUndefined()
    expect(uiStore.openTabs.find((t) => t.id === 'session:sess-1')).toBeUndefined()
    expect(uiStore.selectedSessionId).toBeNull()
  })
})


