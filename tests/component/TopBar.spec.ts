import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TopBar from '@renderer/components/TopBar.vue'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useProfileStore } from '@renderer/stores/profile'
import { useSessionStore } from '@renderer/stores/session.store'
import { useSystemStore } from '@renderer/stores/system'
import { useUiStore } from '@renderer/stores/ui'

describe('TopBar component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    setActivePinia(createPinia())
  })

  it('renders session, environment and profiles controls in the right section', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()
    const profileStore = useProfileStore()
    const sessionStore = useSessionStore()

    sessionStore.sessions = [{ id: 'sess-1', systemId: 'sys-1', name: 'Session One', createdAt: '', updatedAt: '' }]
    environmentStore.environments = [{ id: 'env-dev', name: 'Development' }]
    profileStore.setProfiles([{ id: 'profile-1', name: 'Default' }])
    await wrapper.vm.$nextTick()

    const rightSection = wrapper.find('.top-bar__right')
    expect(rightSection.exists()).toBe(true)
    expect(rightSection.find('#session-select').exists()).toBe(true)
    expect(rightSection.find('#environment-select').exists()).toBe(true)

    const labels = rightSection.findAll('.top-bar__label').map((el) => el.text())
    expect(labels).toEqual(['Session', 'Environment', 'Profiles'])
  })

  it('updates selected session in both session and ui stores on dropdown change', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const sessionStore = useSessionStore()
    const uiStore = useUiStore()

    sessionStore.sessions = [
      { id: 'sess-1', systemId: 'sys-1', name: 'Session One', createdAt: '', updatedAt: '' },
      { id: 'sess-2', systemId: 'sys-1', name: 'Session Two', createdAt: '', updatedAt: '' }
    ]
    await wrapper.vm.$nextTick()

    await wrapper.find('#session-select').setValue('sess-2')
    expect(sessionStore.selectedSessionId).toBe('sess-2')
    expect(uiStore.selectedSessionId).toBe('sess-2')
  })

  it('creates a session from the top bar create button', async () => {
    ;(window as any).app = {
      api: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: 'sess-new',
            systemId: 'sys-1',
            name: 'Session 2026-04-02 #1',
            createdAt: '',
            updatedAt: ''
          })
        }
      }
    }

    const pinia = createPinia()
    const systemStore = useSystemStore(pinia)
    systemStore.selectedSystemId = 'sys-1'
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const sessionStore = useSessionStore()
    const uiStore = useUiStore()

    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="create-session-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect((window as any).app.api.sessions.create).toHaveBeenCalledWith('sys-1')
    expect(sessionStore.selectedSessionId).toBe('sess-new')
    expect(uiStore.selectedSessionId).toBe('sess-new')
  })

  it('renames selected session from the top bar edit button', async () => {
    const renameMock = vi.fn().mockResolvedValue({
      id: 'sess-1',
      systemId: 'sys-1',
      name: 'Renamed Session',
      createdAt: '',
      updatedAt: '2026-04-02T00:00:00.000Z'
    })
    ;(window as any).app = { api: { sessions: { rename: renameMock } } }

    const pinia = createPinia()
    const systemStore = useSystemStore(pinia)
    const sessionStore = useSessionStore(pinia)
    systemStore.selectedSystemId = 'sys-1'
    sessionStore.sessions = [
      { id: 'sess-1', systemId: 'sys-1', name: 'Session One', createdAt: '', updatedAt: '' }
    ]
    sessionStore.selectSession('sess-1')
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const uiStore = useUiStore()

    await wrapper.vm.$nextTick()
    uiStore.openTab({ id: 'session:sess-1', type: 'session', title: 'Session One' })

    await wrapper.find('[data-testid="rename-session-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    // The rename modal is teleported to document.body, so it lives outside the wrapper
    await new DOMWrapper(document.querySelector('[data-testid="topbar-session-rename-input"]')!).setValue('Renamed Session')
    await new DOMWrapper(document.querySelector('[data-testid="topbar-session-rename-save"]')!).trigger('click')
    await wrapper.vm.$nextTick()

    expect(renameMock).toHaveBeenCalledWith('sys-1', 'sess-1', 'Renamed Session')
    expect(uiStore.openTabs.find((t) => t.id === 'session:sess-1')?.title).toBe('Renamed Session')
  })

  it('shows the (none) option as the first option in the session dropdown', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const sessionStore = useSessionStore()

    sessionStore.sessions = [{ id: 'sess-1', systemId: 'sys-1', name: 'Session One', createdAt: '', updatedAt: '' }]
    await wrapper.vm.$nextTick()

    const options = wrapper.find('#session-select').findAll('option')
    expect(options[0].element.value).toBe('')
    expect(options[0].text()).toBe('(none)')
  })

  it('updates selected environment on dropdown change', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()

    environmentStore.environments = [
      { id: 'env-dev', name: 'Development' },
      { id: 'env-prod', name: 'Production' }
    ]
    await wrapper.vm.$nextTick()

    await wrapper.find('#environment-select').setValue('env-prod')
    expect(environmentStore.selectedEnvironmentId).toBe('env-prod')
  })

  it('shows (none) option to clear the environment selection', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()

    environmentStore.environments = [{ id: 'env-dev', name: 'Development' }]
    environmentStore.selectEnvironment('env-dev')
    await wrapper.vm.$nextTick()

    expect(environmentStore.selectedEnvironmentId).toBe('env-dev')

    await wrapper.find('#environment-select').setValue('')
    expect(environmentStore.selectedEnvironmentId).toBeNull()
  })

  it('shows the (none) option as the first option in the environment dropdown', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()

    environmentStore.environments = [{ id: 'env-dev', name: 'Development' }]
    await wrapper.vm.$nextTick()

    const options = wrapper.find('#environment-select').findAll('option')
    expect(options[0].element.value).toBe('')
    expect(options[0].text()).toBe('(none)')
  })

  it('renders profile chips and shows order number on active profiles', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const profileStore = useProfileStore()

    profileStore.setProfiles([
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' }
    ])
    profileStore.toggleProfile('p2')
    profileStore.toggleProfile('p1')
    await wrapper.vm.$nextTick()

    const chips = wrapper.findAll('.top-bar__profile-chip')
    expect(chips).toHaveLength(2)

    // p2 was selected first so it is #1, p1 is #2
    const p2Chip = chips.find((c) => c.text().includes('Beta'))!
    const p1Chip = chips.find((c) => c.text().includes('Alpha'))!
    expect(p2Chip.find('.top-bar__profile-order').text()).toBe('1')
    expect(p1Chip.find('.top-bar__profile-order').text()).toBe('2')
  })

  it('shows empty state with create link when no profiles exist', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    await wrapper.vm.$nextTick()

    const empty = wrapper.find('.top-bar__profile-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('No profiles')
    expect(empty.find('.top-bar__profile-create-link').exists()).toBe(true)
  })

  it('opens profile editor tab when create link is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const uiStore = useUiStore()
    await wrapper.vm.$nextTick()

    await wrapper.find('.top-bar__profile-create-link').trigger('click')
    expect(uiStore.openTabs.some((t) => t.type === 'profile')).toBe(true)
  })

  it('toggles profile active state on chip click', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const profileStore = useProfileStore()

    profileStore.setProfiles([{ id: 'p1', name: 'Alpha' }])
    await wrapper.vm.$nextTick()

    expect(profileStore.activeProfileIds).toHaveLength(0)
    await wrapper.find('.top-bar__profile-chip').trigger('click')
    expect(profileStore.activeProfileIds).toContain('p1')
    await wrapper.find('.top-bar__profile-chip').trigger('click')
    expect(profileStore.activeProfileIds).not.toContain('p1')
  })
})
