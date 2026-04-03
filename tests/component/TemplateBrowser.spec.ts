import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TemplateBrowser from '@renderer/components/TemplateBrowser/TemplateBrowser.vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useTemplateStore } from '@renderer/stores/template.store'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useSessionStore } from '@renderer/stores/session.store'

const mockTemplate = {
  id: 'tmpl-1',
  systemId: 'sys-1',
  folderId: null,
  name: 'Order Template',
  description: 'Creates an order event',
  schemaId: 'sch-1',
  inputId: 'inp-1',
  profileIds: ['prof-1'],
  fields: [
    { elementPath: 'payload.orderId', value: '123', omitted: false },
    { elementPath: 'payload.status', value: '', omitted: true }
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
}

const mockFolder = {
  id: 'folder-1',
  systemId: 'sys-1',
  parentId: null,
  name: 'Orders'
}

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      systems: {
        get: vi.fn().mockResolvedValue({
          id: 'sys-1',
          name: 'Test System',
          inputs: [{ id: 'inp-1', name: 'Kinesis Stream', type: 'kinesis', config: {} }],
          outputs: []
        }),
        ...overrides.systems
      },
      schemas: {
        list: vi.fn().mockResolvedValue([{ id: 'sch-1', name: 'Order Schema' }]),
        ...overrides.schemas
      },
      profiles: {
        list: vi.fn().mockResolvedValue([{ id: 'prof-1', name: 'Default Profile' }]),
        ...overrides.profiles
      },
      templates: {
        list: vi.fn().mockResolvedValue({ folders: [], templates: [] }),
        get: vi.fn().mockResolvedValue(mockTemplate),
        createFolder: vi.fn().mockResolvedValue(mockFolder),
        deleteFolder: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        move: vi.fn().mockResolvedValue({ ...mockTemplate, folderId: 'folder-1' }),
        ...overrides.templates
      },
      events: {
        generate: vi.fn().mockResolvedValue({
          schemaId: 'sch-1',
          payload: { orderId: '123' },
          appliedProfiles: [],
          warnings: []
        }),
        send: vi.fn().mockResolvedValue({ success: true, sessionEventId: 'evt-1' }),
        ...overrides.events
      },
      sessions: {
        list: vi.fn().mockResolvedValue([{ id: 'sess-1', systemId: 'sys-1', name: 'Session 1' }]),
        create: vi.fn().mockResolvedValue({ id: 'sess-new', systemId: 'sys-1', name: 'New Session' }),
        ...overrides.sessions
      },
      ...overrides
    }
  }
}

function mountBrowser(pinia = createPinia()) {
  const wrapper = mount(TemplateBrowser, { global: { plugins: [pinia] } })
  return { wrapper, pinia }
}

function setupStores(pinia = createPinia()) {
  setActivePinia(pinia)
  const systemStore = useSystemStore()
  systemStore.selectedSystemId = 'sys-1'
  const schemaStore = useSchemaStore()
  schemaStore.schemas = [{ id: 'sch-1', name: 'Order Schema' }]
  const profileStore = useProfileStore()
  profileStore.availableProfiles = [{ id: 'prof-1', name: 'Default Profile' }]
  const sessionStore = useSessionStore()
  sessionStore.selectedSessionId = 'sess-1'
  return { systemStore, schemaStore, profileStore, sessionStore, pinia }
}

describe('TemplateBrowser component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  // ─── Rendering ───────────────────────────────────────────────────────────────

  it('renders the title', () => {
    const { wrapper } = mountBrowser()
    expect(wrapper.find('[data-testid="tb-title"]').text()).toBe('Templates')
  })

  it('renders folder tree panel', () => {
    const { wrapper } = mountBrowser()
    expect(wrapper.find('[data-testid="folder-tree"]').exists()).toBe(true)
  })

  it('renders the template list panel', () => {
    const { wrapper } = mountBrowser()
    expect(wrapper.find('[data-testid="template-list"]').exists()).toBe(true)
  })

  it('renders the template detail panel', () => {
    const { wrapper } = mountBrowser()
    expect(wrapper.find('[data-testid="template-detail"]').exists()).toBe(true)
  })

  it('shows New Template and New Folder toolbar buttons', () => {
    const { wrapper } = mountBrowser()
    expect(wrapper.find('[data-testid="new-template-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="new-folder-btn"]').exists()).toBe(true)
  })

  it('shows root folder item in tree', () => {
    const { wrapper } = mountBrowser()
    expect(wrapper.find('[data-testid="folder-root"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="folder-root"]').text()).toContain('Root')
  })

  // ─── Folder tree rendering ────────────────────────────────────────────────────

  it('renders folders from template store', async () => {
    const pinia = createPinia()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.folders = [{ id: 'folder-1', name: 'Orders', parentId: null }]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="folder-item-folder-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="folder-item-folder-1"]').text()).toContain('Orders')
  })

  it('shows folder tree empty state when no folders', async () => {
    const pinia = createPinia()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.folders = []
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="folder-tree-empty"]').exists()).toBe(true)
  })

  it('selects root folder by default (template list shows root templates)', async () => {
    const pinia = createPinia()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="template-item-tmpl-1"]').exists()).toBe(true)
  })

  it('clicking a folder updates the template list', async () => {
    const pinia = createPinia()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.folders = [{ id: 'folder-1', name: 'Orders', parentId: null }]
    templateStore.templates = [
      { id: 'tmpl-1', name: 'Root Template', folderId: null },
      { id: 'tmpl-2', name: 'Folder Template', folderId: 'folder-1' }
    ]
    await wrapper.vm.$nextTick()

    // Initially root is selected → tmpl-1 visible
    expect(wrapper.find('[data-testid="template-item-tmpl-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-item-tmpl-2"]').exists()).toBe(false)

    // Click folder-1
    await wrapper.find('[data-testid="folder-item-folder-1"]').trigger('click')
    await wrapper.vm.$nextTick()

    // Now tmpl-2 should be visible
    expect(wrapper.find('[data-testid="template-item-tmpl-2"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="template-item-tmpl-1"]').exists()).toBe(false)
  })

  it('shows empty state when no templates in selected folder', async () => {
    const pinia = createPinia()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = []
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="template-list-empty"]').exists()).toBe(true)
  })

  it('expands/collapses folder on toggle click', async () => {
    const pinia = createPinia()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.folders = [
      { id: 'folder-1', name: 'Orders', parentId: null },
      { id: 'folder-2', name: 'Payments', parentId: 'folder-1' }
    ]
    await wrapper.vm.$nextTick()

    // folder-2 is child of folder-1; not visible until folder-1 is expanded
    expect(wrapper.find('[data-testid="folder-item-folder-2"]').exists()).toBe(false)

    const toggle = wrapper.find('[data-testid="folder-item-folder-1"] .tb__tree-toggle')
    await toggle.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('[data-testid="folder-item-folder-2"]').exists()).toBe(true)
  })

  // ─── Template selection ──────────────────────────────────────────────────────

  it('selecting a template shows its detail', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="detail-name"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="detail-name"]').text()).toBe('Order Template')
  })

  it('shows template description in detail panel', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="detail-description"]').text()).toBe('Creates an order event')
  })

  it('shows schema link in detail panel', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="schema-link"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="schema-link"]').text()).toBe('Order Schema')
  })

  it('shows destination in detail panel', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="detail-destination"]').text()).toContain('Kinesis Stream')
  })

  it('shows applied profiles in detail panel', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="profile-chip-0"]').text()).toBe('Default Profile')
  })

  it('shows preset fields table in detail panel', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="fields-table"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="field-row-0"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="field-omitted-1"]').exists()).toBe(true)
  })

  it('shows action buttons when template is selected', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="send-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="edit-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="preview-btn"]').exists()).toBe(true)
  })

  // ─── Quick-send ──────────────────────────────────────────────────────────────

  it('quick-send button triggers generate and send, shows success result', async () => {
    const { pinia } = setupStores()
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: { orderId: '123' },
      appliedProfiles: [],
      warnings: []
    })
    const sendMock = vi.fn().mockResolvedValue({ success: true, sessionEventId: 'evt-1' })
    mockAppApi({ events: { generate: generateMock, send: sendMock } })
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="send-btn"]').trigger('click')
    await flushPromises()

    expect(generateMock).toHaveBeenCalled()
    expect(sendMock).toHaveBeenCalled()
    const result = wrapper.find('[data-testid="send-result"]')
    expect(result.exists()).toBe(true)
    expect(result.classes()).toContain('tb__send-result--success')
  })

  it('shows failure notification when send fails', async () => {
    const { pinia } = setupStores()
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: { orderId: '123' },
      appliedProfiles: [],
      warnings: []
    })
    const sendMock = vi.fn().mockRejectedValue(new Error('Connection timeout'))
    mockAppApi({ events: { generate: generateMock, send: sendMock } })
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="send-btn"]').trigger('click')
    await flushPromises()

    const result = wrapper.find('[data-testid="send-result"]')
    expect(result.exists()).toBe(true)
    expect(result.classes()).toContain('tb__send-result--failure')
  })

  // ─── Generate Preview ────────────────────────────────────────────────────────

  it('Generate Preview button shows event JSON without sending', async () => {
    const { pinia } = setupStores()
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: { orderId: '123' },
      appliedProfiles: [],
      warnings: []
    })
    const sendMock = vi.fn()
    mockAppApi({ events: { generate: generateMock, send: sendMock } })
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="preview-btn"]').trigger('click')
    await flushPromises()

    expect(generateMock).toHaveBeenCalled()
    expect(sendMock).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="preview-json"]').exists()).toBe(true)
  })

  // ─── Edit button ─────────────────────────────────────────────────────────────

  it('Edit button opens template editor tab', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="edit-btn"]').trigger('click')

    const uiStore = useUiStore()
    expect(uiStore.openTabs).toContainEqual(
      expect.objectContaining({ id: 'template:tmpl-1', type: 'template' })
    )
  })

  it('New Template button opens template editor with new tab', async () => {
    const { wrapper } = mountBrowser()
    await wrapper.find('[data-testid="new-template-btn"]').trigger('click')
    const uiStore = useUiStore()
    expect(uiStore.openTabs).toContainEqual(
      expect.objectContaining({ id: 'template:new', type: 'template' })
    )
  })

  it('clicking schema link opens schema tab', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="schema-link"]').trigger('click')

    const uiStore = useUiStore()
    expect(uiStore.openTabs).toContainEqual(
      expect.objectContaining({ id: 'schema:sch-1', type: 'schema' })
    )
  })

  // ─── New Folder ───────────────────────────────────────────────────────────────

  it('New Folder button opens dialog', async () => {
    const { wrapper } = mountBrowser()
    await wrapper.find('[data-testid="new-folder-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(document.querySelector('[data-testid="new-folder-dialog"]')).toBeTruthy()
  })

  it('creates a folder when dialog is confirmed', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const createFolderMock = vi.fn().mockResolvedValue(mockFolder)
    const listMock = vi.fn().mockResolvedValue({ folders: [{ folder: mockFolder, children: [], templates: [] }], templates: [] })
    mockAppApi({
      templates: {
        list: listMock,
        get: vi.fn().mockResolvedValue(mockTemplate),
        createFolder: createFolderMock,
        deleteFolder: vi.fn(),
        delete: vi.fn(),
        move: vi.fn()
      }
    })
    const { wrapper } = mountBrowser(pinia)
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    await wrapper.vm.$nextTick()

    // Set folder dialog state and call createFolder directly
    ;(wrapper.vm as any).newFolderDialog.name = 'My Folder'
    ;(wrapper.vm as any).newFolderDialog.visible = true
    ;(wrapper.vm as any).newFolderDialog.parentId = null
    await (wrapper.vm as any).createFolder()
    await flushPromises()

    expect(createFolderMock).toHaveBeenCalledWith('sys-1', 'My Folder', null)
  })

  // ─── Delete ───────────────────────────────────────────────────────────────────

  it('context menu delete shows confirmation dialog', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="template-item-tmpl-1"]').trigger('contextmenu')
    await wrapper.vm.$nextTick()
    const ctxDelete = document.querySelector('[data-testid="ctx-delete"]') as HTMLElement
    ctxDelete?.click()
    await wrapper.vm.$nextTick()

    expect(document.querySelector('[data-testid="delete-confirm-dialog"]')).toBeTruthy()
  })

  it('confirms deletion of a template', async () => {
    const { pinia } = setupStores()
    const deleteMock = vi.fn().mockResolvedValue(undefined)
    const listMock = vi.fn().mockResolvedValue({ folders: [], templates: [] })
    mockAppApi({
      templates: {
        list: listMock,
        get: vi.fn().mockResolvedValue(mockTemplate),
        createFolder: vi.fn(),
        deleteFolder: vi.fn(),
        delete: deleteMock,
        move: vi.fn()
      }
    })
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()

    // Set delete confirm state and call confirmDelete directly
    ;(wrapper.vm as any).deleteConfirm.visible = true
    ;(wrapper.vm as any).deleteConfirm.type = 'template'
    ;(wrapper.vm as any).deleteConfirm.id = 'tmpl-1'
    ;(wrapper.vm as any).deleteConfirm.name = 'Order Template'
    await (wrapper.vm as any).confirmDelete()
    await flushPromises()

    expect(deleteMock).toHaveBeenCalledWith('sys-1', 'tmpl-1')
  })

  // ─── Drag and drop ────────────────────────────────────────────────────────────

  it('templates are draggable', async () => {
    const pinia = createPinia()
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()
    const item = wrapper.find('[data-testid="template-item-tmpl-1"]')
    expect(item.attributes('draggable')).toBe('true')
  })

  it('dropping a template on a folder moves it', async () => {
    const { pinia } = setupStores()
    const moveMock = vi.fn().mockResolvedValue({ ...mockTemplate, folderId: 'folder-1' })
    const listMock = vi.fn().mockResolvedValue({
      folders: [{ folder: mockFolder, children: [], templates: [] }],
      templates: [mockTemplate]
    })
    mockAppApi({
      templates: {
        list: listMock,
        get: vi.fn().mockResolvedValue(mockTemplate),
        createFolder: vi.fn(),
        deleteFolder: vi.fn(),
        delete: vi.fn(),
        move: moveMock
      }
    })
    const { wrapper } = mountBrowser(pinia)
    const templateStore = useTemplateStore()
    templateStore.folders = [{ id: 'folder-1', name: 'Orders', parentId: null }]
    templateStore.templates = [{ id: 'tmpl-1', name: 'Order Template', folderId: null }]
    await wrapper.vm.$nextTick()

    const item = wrapper.find('[data-testid="template-item-tmpl-1"]')
    const folderItem = wrapper.find('[data-testid="folder-item-folder-1"]')

    // Simulate drag start
    await item.trigger('dragstart', {
      dataTransfer: { effectAllowed: '', setData: vi.fn() }
    })

    // Simulate drop on folder
    await folderItem.trigger('drop', {
      dataTransfer: { dropEffect: '' },
      preventDefault: vi.fn()
    })
    await flushPromises()

    expect(moveMock).toHaveBeenCalledWith('sys-1', 'tmpl-1', 'folder-1')
  })
})
