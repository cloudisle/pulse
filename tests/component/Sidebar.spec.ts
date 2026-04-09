import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from '@renderer/components/Sidebar.vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useOpenApiImportStore } from '@renderer/stores/openapi-import.store'

function mountSidebar(pinia = createPinia()) {
  return mount(Sidebar, {
    global: {
      plugins: [pinia],
      stubs: { teleport: true }
    }
  })
}

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      systems: { list: vi.fn().mockResolvedValue([]) },
      schemas: {
        list: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue(undefined)
      },
      environments: { list: vi.fn().mockResolvedValue([]) },
      profiles: { list: vi.fn().mockResolvedValue([]) },
      templates: { list: vi.fn().mockResolvedValue({ folders: [], templates: [] }) },
      customTypes: { list: vi.fn().mockResolvedValue([]) },
      sessions: { list: vi.fn().mockResolvedValue([]) },
      ...overrides
    }
  }
}

describe('Sidebar component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
  })

  it('renders all navigation sections when expanded', () => {
    const wrapper = mountSidebar(createPinia())
    const titles = wrapper.findAll('.sidebar__section-title').map((el) => el.text())
    expect(titles).toEqual(['Systems', 'Schemas', 'Environments', 'Profiles', 'Custom Types', 'Templates'])
    expect(wrapper.find('[data-testid="sessions-btn"]').exists()).toBe(true)
  })

  it('hides navigation when collapsed', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    const store = useUiStore()
    store.toggleSidebar()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar__nav').exists()).toBe(false)
  })

  it('toggles sidebar collapsed state on toggle button click', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    const store = useUiStore()
    expect(store.sidebarCollapsed).toBe(false)
    await wrapper.find('.sidebar__toggle').trigger('click')
    expect(store.sidebarCollapsed).toBe(true)
    await wrapper.find('.sidebar__toggle').trigger('click')
    expect(store.sidebarCollapsed).toBe(false)
  })

  it('applies collapsed class when sidebar is collapsed', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    const store = useUiStore()
    expect(wrapper.find('.sidebar--collapsed').exists()).toBe(false)
    store.toggleSidebar()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar--collapsed').exists()).toBe(true)
  })

  it('loads systems on mount and populates the system dropdown', async () => {
    const systems = [
      { id: 'sys1', name: 'Production' },
      { id: 'sys2', name: 'Staging' }
    ]
    mockAppApi({ systems: { list: vi.fn().mockResolvedValue(systems) } })
    const pinia = createPinia()
    mountSidebar(pinia)
    await flushPromises()
    const systemStore = useSystemStore()
    expect(systemStore.systems).toEqual(systems)
  })

  it('loads child entities when a system is selected', async () => {
    const schemas = [{ id: 'sch1', name: 'Order Schema' }]
    const environments = [{ id: 'env1', name: 'Production Env' }]
    const profiles = [{ id: 'prof1', name: 'Default Profile' }]
    const templates = { folders: [], templates: [{ id: 'tmpl1', name: 'Order Template', folderId: null }] }
    const schemaListMock = vi.fn().mockResolvedValue(schemas)
    const envListMock = vi.fn().mockResolvedValue(environments)
    const profileListMock = vi.fn().mockResolvedValue(profiles)
    const templateListMock = vi.fn().mockResolvedValue(templates)
    mockAppApi({
      schemas: { list: schemaListMock },
      environments: { list: envListMock },
      profiles: { list: profileListMock },
      templates: { list: templateListMock },
      sessions: { list: vi.fn().mockResolvedValue([]) }
    })
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    await flushPromises()

    // Pre-populate the systems dropdown so setValue can select a valid option
    const systemStore = useSystemStore()
    systemStore.systems = [{ id: 'sys1', name: 'Production' }]
    await wrapper.vm.$nextTick()

    const select = wrapper.find('.sidebar__system-select')
    await select.setValue('sys1')
    await flushPromises()

    expect(schemaListMock).toHaveBeenCalledWith('sys1')
    expect(envListMock).toHaveBeenCalledWith('sys1')
    expect(profileListMock).toHaveBeenCalledWith('sys1')
    expect(templateListMock).toHaveBeenCalledWith('sys1')

    const schemaStore = useSchemaStore()
    expect(schemaStore.schemas).toEqual([{ id: 'sch1', name: 'Order Schema' }])

    const { useEnvironmentStore } = await import('@renderer/stores/environment')
    const { useProfileStore } = await import('@renderer/stores/profile')
    const { useTemplateStore } = await import('@renderer/stores/template.store')
    expect(useEnvironmentStore().environments).toEqual([{ id: 'env1', name: 'Production Env' }])
    expect(useProfileStore().availableProfiles).toEqual([{ id: 'prof1', name: 'Default Profile' }])
    expect(useTemplateStore().templates).toEqual([{ id: 'tmpl1', name: 'Order Template', folderId: null }])
  })

  it('opens a schema tab when a schema item is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    const schemaStore = useSchemaStore()
    schemaStore.schemas = [{ id: 'sch1', name: 'My Schema' }]
    await wrapper.vm.$nextTick()

    const item = wrapper.find('.sidebar__item')
    await item.trigger('click')

    const uiStore = useUiStore()
    expect(uiStore.openTabs).toContainEqual(
      expect.objectContaining({ id: 'schema:sch1', type: 'schema', title: 'My Schema' })
    )
  })

  it('focuses an existing tab instead of opening a duplicate', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    const schemaStore = useSchemaStore()
    schemaStore.schemas = [{ id: 'sch1', name: 'My Schema' }]
    await wrapper.vm.$nextTick()

    const item = wrapper.find('.sidebar__item')
    await item.trigger('click')
    await item.trigger('click')

    const uiStore = useUiStore()
    expect(uiStore.openTabs.filter((t) => t.id === 'schema:sch1')).toHaveLength(1)
    expect(uiStore.activeTabId).toBe('schema:sch1')
  })

  it('opens the create schema tab when the Schemas + button is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)

    await wrapper.find('[data-testid="create-schema-btn"]').trigger('click')

    const uiStore = useUiStore()
    expect(uiStore.openTabs).toContainEqual(
      expect.objectContaining({ id: 'schema:new', type: 'schema' })
    )
  })

  it('opens the sessions tab when the Sessions footer button is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)

    await wrapper.find('[data-testid="sessions-btn"]').trigger('click')

    const uiStore = useUiStore()
    expect(uiStore.openTabs).toContainEqual(
      expect.objectContaining({ id: 'sessions', type: 'sessions', title: 'Sessions' })
    )
    expect(uiStore.activeTabId).toBe('sessions')
  })

  it('deletes schema from context menu', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const deleteMock = vi.fn().mockResolvedValue(undefined)
    mockAppApi({
      schemas: { list: vi.fn().mockResolvedValue([]), delete: deleteMock },
      templates: { list: vi.fn().mockResolvedValue({ folders: [], templates: [] }) }
    })

    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    const schemaStore = useSchemaStore()
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys1'
    schemaStore.schemas = [{ id: 'sch1', name: 'My Schema' }]
    await wrapper.vm.$nextTick()

    await wrapper.find('.sidebar__item').trigger('contextmenu', {
      button: 2,
      clientX: 120,
      clientY: 80,
    })
    await wrapper.vm.$nextTick()
    const deleteBtn = wrapper.findAll('.sidebar__context-item').find((btn) => btn.text() === 'Delete')
    expect(deleteBtn).toBeDefined()
    await deleteBtn!.trigger('click')
    await flushPromises()

    expect(deleteMock).toHaveBeenCalledWith('sys1', 'sch1')
    expect(schemaStore.schemas).toEqual([])
    confirmSpy.mockRestore()
  })

  it('opens OpenAPI modal in schema sync mode from context menu', async () => {
    const pinia = createPinia()
    const wrapper = mountSidebar(pinia)
    const schemaStore = useSchemaStore()
    schemaStore.schemas = [{ id: 'sch1', name: 'My Schema' }]
    await wrapper.vm.$nextTick()

    await wrapper.find('.sidebar__item').trigger('contextmenu')
    await wrapper.vm.$nextTick()
    const syncBtn = wrapper.findAll('.sidebar__context-item').find((btn) => btn.text() === 'Sync from OpenAPI')
    expect(syncBtn).toBeDefined()
    await syncBtn!.trigger('click')

    const importStore = useOpenApiImportStore()
    expect(importStore.isOpen).toBe(true)
    expect(importStore.mode).toBe('schema-sync')
    expect(importStore.syncTargetSchemaId).toBe('sch1')
  })
})
