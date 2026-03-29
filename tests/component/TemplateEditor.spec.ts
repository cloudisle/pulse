import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TemplateEditor from '@renderer/components/TemplateEditor/TemplateEditor.vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useTemplateStore } from '@renderer/stores/template.store'

const mockTemplate = {
  id: 'tmpl-1',
  systemId: 'sys-1',
  folderId: null,
  name: 'Order Template',
  description: 'Creates an order event',
  schemaId: 'sch-1',
  inputId: 'inp-1',
  profileIds: ['prof-1'],
  fields: [{ elementPath: 'payload.orderId', value: '123', omitted: false }],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
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
        get: vi.fn().mockResolvedValue({
          id: 'sch-1',
          name: 'Order Schema',
          elements: [
            { name: 'orderId', required: true, dataType: { type: 'string' }, generationStrategy: { type: 'random', config: {} } },
            { name: 'status', required: false, dataType: { type: 'string' }, generationStrategy: { type: 'random', config: {} } }
          ]
        }),
        ...overrides.schemas
      },
      profiles: {
        list: vi.fn().mockResolvedValue([
          { id: 'prof-1', name: 'Default Profile' },
          { id: 'prof-2', name: 'QA Profile' }
        ]),
        ...overrides.profiles
      },
      templates: {
        list: vi.fn().mockResolvedValue({ folders: [], templates: [] }),
        get: vi.fn().mockResolvedValue(mockTemplate),
        create: vi.fn().mockResolvedValue({ ...mockTemplate, id: 'tmpl-new' }),
        update: vi.fn().mockResolvedValue(mockTemplate),
        ...overrides.templates
      },
      ...overrides
    }
  }
}

function mountEditor(props: { templateId?: string } = {}, pinia = createPinia()) {
  const wrapper = mount(TemplateEditor, {
    global: { plugins: [pinia] },
    props
  })
  return { wrapper, pinia }
}

function setupStores(pinia = createPinia()) {
  setActivePinia(pinia)
  const systemStore = useSystemStore()
  systemStore.selectedSystemId = 'sys-1'
  const schemaStore = useSchemaStore()
  schemaStore.schemas = [{ id: 'sch-1', name: 'Order Schema' }]
  const profileStore = useProfileStore()
  profileStore.availableProfiles = [
    { id: 'prof-1', name: 'Default Profile' },
    { id: 'prof-2', name: 'QA Profile' }
  ]
  const templateStore = useTemplateStore()
  templateStore.folders = []
  return { systemStore, schemaStore, profileStore, templateStore, pinia }
}

describe('TemplateEditor component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  // ─── Rendering ───────────────────────────────────────────────────────────────

  it('renders name input', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="template-name"]').exists()).toBe(true)
  })

  it('renders description input', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="template-description"]').exists()).toBe(true)
  })

  it('renders schema selector', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="schema-select"]').exists()).toBe(true)
  })

  it('renders destination (input) selector', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="input-select"]').exists()).toBe(true)
  })

  it('renders folder selector', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="folder-select"]').exists()).toBe(true)
  })

  it('renders profiles section', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="profiles-section"]').exists()).toBe(true)
  })

  it('renders Save and Cancel buttons', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="cancel-btn"]').exists()).toBe(true)
  })

  it('renders Add Field button', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="add-field-btn"]').exists()).toBe(true)
  })

  it('shows empty state when no fields', () => {
    const { wrapper } = mountEditor()
    expect(wrapper.find('[data-testid="fields-empty"]').exists()).toBe(true)
  })

  // ─── Create mode ─────────────────────────────────────────────────────────────

  it('starts with empty name and description in create mode', () => {
    const { wrapper } = mountEditor()
    expect((wrapper.find('[data-testid="template-name"]').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('[data-testid="template-description"]').element as HTMLInputElement).value).toBe('')
  })

  it('shows available schemas in selector', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountEditor({}, pinia)
    await flushPromises()
    const options = wrapper.findAll('[data-testid="schema-select"] option')
    expect(options.some((o) => o.text() === 'Order Schema')).toBe(true)
  })

  it('shows available profiles as checkboxes', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountEditor({}, pinia)
    await flushPromises()
    expect(wrapper.find('[data-testid="profile-row-prof-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="profile-row-prof-2"]').exists()).toBe(true)
  })

  it('shows available folders in folder selector', async () => {
    const { pinia } = setupStores()
    const templateStore = useTemplateStore()
    templateStore.folders = [{ id: 'folder-1', name: 'Orders', parentId: null }]
    mockAppApi({
      templates: {
        list: vi.fn().mockResolvedValue({
          folders: [{ folder: { id: 'folder-1', name: 'Orders', parentId: null, systemId: 'sys-1' }, children: [], templates: [] }],
          templates: []
        }),
        get: vi.fn().mockResolvedValue(mockTemplate),
        create: vi.fn().mockResolvedValue({ ...mockTemplate, id: 'tmpl-new' }),
        update: vi.fn().mockResolvedValue(mockTemplate)
      }
    })
    const { wrapper } = mountEditor({}, pinia)
    await flushPromises()
    const options = wrapper.findAll('[data-testid="folder-select"] option')
    expect(options.some((o) => o.text() === 'Orders')).toBe(true)
  })

  // ─── Field management ─────────────────────────────────────────────────────────

  it('adds a field row when Add Field is clicked', async () => {
    const { wrapper } = mountEditor()
    await wrapper.find('[data-testid="add-field-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="field-row-0"]').exists()).toBe(true)
  })

  it('removes a field row when remove button is clicked', async () => {
    const { wrapper } = mountEditor()
    await wrapper.find('[data-testid="add-field-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="field-row-0"]').exists()).toBe(true)
    await wrapper.find('[data-testid="field-remove-0"]').trigger('click')
    expect(wrapper.find('[data-testid="field-row-0"]').exists()).toBe(false)
  })

  it('omit checkbox disables value input', async () => {
    const { wrapper } = mountEditor()
    await wrapper.find('[data-testid="add-field-btn"]').trigger('click')
    const omitCb = wrapper.find('[data-testid="field-omit-0"]')
    await omitCb.setValue(true)
    const valueInput = wrapper.find('[data-testid="field-value-0"]')
    expect((valueInput.element as HTMLInputElement).disabled).toBe(true)
  })

  // ─── Profile ordering ─────────────────────────────────────────────────────────

  it('selecting multiple profiles shows order controls', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountEditor({}, pinia)
    await flushPromises()
    await wrapper.find('[data-testid="profile-checkbox-prof-1"]').setValue(true)
    await wrapper.find('[data-testid="profile-checkbox-prof-2"]').setValue(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="profile-order"]').exists()).toBe(true)
  })

  it('profile order up/down buttons reorder profiles', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountEditor({}, pinia)
    await flushPromises()
    await wrapper.find('[data-testid="profile-checkbox-prof-1"]').setValue(true)
    await wrapper.find('[data-testid="profile-checkbox-prof-2"]').setValue(true)
    await wrapper.vm.$nextTick()
    // Move prof-2 up (idx=1 → idx=0)
    await wrapper.find('[data-testid="profile-up-1"]').trigger('click')
    await wrapper.vm.$nextTick()
    const first = wrapper.find('[data-testid="profile-order-0"]').text()
    expect(first).toContain('QA Profile')
  })

  // ─── Edit mode ────────────────────────────────────────────────────────────────

  it('loads existing template data in edit mode', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountEditor({ templateId: 'tmpl-1' }, pinia)
    await flushPromises()
    const nameInput = wrapper.find('[data-testid="template-name"]').element as HTMLInputElement
    expect(nameInput.value).toBe('Order Template')
  })

  it('populates fields from existing template in edit mode', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountEditor({ templateId: 'tmpl-1' }, pinia)
    await flushPromises()
    expect(wrapper.find('[data-testid="field-row-0"]').exists()).toBe(true)
  })

  // ─── Validation ───────────────────────────────────────────────────────────────

  it('shows error when saving without a name', async () => {
    const { wrapper } = mountEditor()
    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('name is required')
  })

  it('shows error when saving without a schema', async () => {
    const { wrapper } = mountEditor()
    await wrapper.find('[data-testid="template-name"]').setValue('My Template')
    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('schema is required')
  })

  it('shows error when saving without an input', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const { wrapper } = mountEditor({}, pinia)
    await flushPromises()
    await wrapper.find('[data-testid="template-name"]').setValue('My Template')
    await wrapper.find('[data-testid="schema-select"]').setValue('sch-1')
    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('destination input is required')
  })

  // ─── Save ─────────────────────────────────────────────────────────────────────

  it('calls create API on save in create mode', async () => {
    const { pinia } = setupStores()
    const createMock = vi.fn().mockResolvedValue({ ...mockTemplate, id: 'tmpl-new' })
    mockAppApi({ templates: { list: vi.fn().mockResolvedValue({ folders: [], templates: [] }), get: vi.fn().mockResolvedValue(mockTemplate), create: createMock, update: vi.fn() } })
    const { wrapper } = mountEditor({}, pinia)
    await flushPromises()

    await wrapper.find('[data-testid="template-name"]').setValue('New Template')
    await wrapper.find('[data-testid="schema-select"]').setValue('sch-1')
    await wrapper.find('[data-testid="input-select"]').setValue('inp-1')
    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    await flushPromises()

    expect(createMock).toHaveBeenCalled()
  })

  it('calls update API on save in edit mode', async () => {
    const { pinia } = setupStores()
    const updateMock = vi.fn().mockResolvedValue(mockTemplate)
    mockAppApi({ templates: { list: vi.fn().mockResolvedValue({ folders: [], templates: [] }), get: vi.fn().mockResolvedValue(mockTemplate), create: vi.fn(), update: updateMock } })
    const { wrapper } = mountEditor({ templateId: 'tmpl-1' }, pinia)
    await flushPromises()

    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    await flushPromises()

    expect(updateMock).toHaveBeenCalled()
  })

  // ─── Cancel ───────────────────────────────────────────────────────────────────

  it('cancel closes the new template tab', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const uiStore = useUiStore()
    uiStore.openTab({ id: 'template:new', type: 'template', title: 'New Template' })
    const { wrapper } = mountEditor({}, pinia)
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click')
    expect(uiStore.openTabs.find((t) => t.id === 'template:new')).toBeUndefined()
  })

  it('cancel closes the edit template tab', async () => {
    const { pinia } = setupStores()
    mockAppApi()
    const uiStore = useUiStore()
    uiStore.openTab({ id: 'template:tmpl-1', type: 'template', title: 'Order Template' })
    const { wrapper } = mountEditor({ templateId: 'tmpl-1' }, pinia)
    await flushPromises()
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click')
    expect(uiStore.openTabs.find((t) => t.id === 'template:tmpl-1')).toBeUndefined()
  })
})
