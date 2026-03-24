import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SchemaEditor from '@renderer/components/SchemaEditor/SchemaEditor.vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      schemas: {
        get: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-schema-id', name: 'New Schema' }),
        update: vi.fn().mockResolvedValue({}),
        validate: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
        list: vi.fn().mockResolvedValue([]),
        ...overrides.schemas
      },
      customTypes: {
        list: vi.fn().mockResolvedValue([]),
        ...overrides.customTypes
      },
      systems: {
        list: vi.fn().mockResolvedValue([]),
        ...overrides.systems
      },
      ...overrides
    }
  }
}

function mountEditor(props: Record<string, any> = {}, systemId = 'sys-1') {
  const pinia = createPinia()
  const wrapper = mount(SchemaEditor, {
    props,
    global: { plugins: [pinia] }
  })
  const systemStore = useSystemStore()
  systemStore.selectedSystemId = systemId
  return { wrapper, pinia }
}

describe('SchemaEditor component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  // ─── Create mode ───────────────────────────────────────────────────────────

  describe('create mode (no schemaId)', () => {
    it('renders schema name and description inputs', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="schema-name"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="schema-description"]').exists()).toBe(true)
    })

    it('renders Save and Validate buttons', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="validate-btn"]').exists()).toBe(true)
    })

    it('shows error when saving without a name', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="error-message"]').text()).toContain('name is required')
    })

    it('shows error when validate is clicked in create mode (unsaved)', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="validate-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="error-message"]').text()).toContain('Save the schema first')
    })

    it('calls schemas.create and opens new tab on successful save', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'created-1', name: 'My Schema' })
      mockAppApi({ schemas: { create: createMock, list: vi.fn().mockResolvedValue([]) } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      uiStore.openTab({ id: 'schema:new', type: 'schema', title: 'New Schema' })

      await wrapper.find('[data-testid="schema-name"]').setValue('My Schema')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Schema', systemId: 'sys-1', elements: [] })
      )
      // Old 'new' tab should be closed; new tab opened
      expect(uiStore.openTabs.find((t) => t.id === 'schema:new')).toBeUndefined()
      expect(uiStore.openTabs.find((t) => t.id === 'schema:created-1')).toBeDefined()
    })
  })

  // ─── Edit mode ─────────────────────────────────────────────────────────────

  describe('edit mode (schemaId provided)', () => {
    const existingSchema = {
      id: 'schema-existing',
      systemId: 'sys-1',
      name: 'Existing Schema',
      description: 'A test schema',
      elements: [
        {
          name: 'userId',
          required: true,
          dataType: { type: 'string' },
          generationStrategy: { type: 'faker', config: { method: 'string.uuid', locale: '' } },
          constraints: {}
        }
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }

    it('loads schema name and description from API', async () => {
      mockAppApi({ schemas: { get: vi.fn().mockResolvedValue(existingSchema) } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, {
        props: { schemaId: 'schema-existing' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      expect((wrapper.find('[data-testid="schema-name"]').element as HTMLInputElement).value).toBe('Existing Schema')
      expect((wrapper.find('[data-testid="schema-description"]').element as HTMLInputElement).value).toBe('A test schema')
    })

    it('renders existing elements from schema', async () => {
      mockAppApi({ schemas: { get: vi.fn().mockResolvedValue(existingSchema) } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, {
        props: { schemaId: 'schema-existing' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="element-row"]')
      expect(rows).toHaveLength(1)
      expect((rows[0].find('[data-testid="element-name"]').element as HTMLInputElement).value).toBe('userId')
    })

    it('calls schemas.update on save in edit mode', async () => {
      const updateMock = vi.fn().mockResolvedValue({})
      mockAppApi({
        schemas: {
          get: vi.fn().mockResolvedValue(existingSchema),
          update: updateMock,
          list: vi.fn().mockResolvedValue([existingSchema])
        }
      })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, {
        props: { schemaId: 'schema-existing' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(updateMock).toHaveBeenCalledWith(
        'sys-1',
        'schema-existing',
        expect.objectContaining({ name: 'Existing Schema' })
      )
    })

    it('shows error message when schema load fails', async () => {
      mockAppApi({ schemas: { get: vi.fn().mockRejectedValue(new Error('Not found')) } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, {
        props: { schemaId: 'missing-schema' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="error-message"]').text()).toContain('Failed to load')
    })
  })

  // ─── Element CRUD ──────────────────────────────────────────────────────────

  describe('element CRUD', () => {
    it('adds an element row when "Add Element" is clicked', async () => {
      const { wrapper } = mountEditor()
      expect(wrapper.findAll('[data-testid="element-row"]')).toHaveLength(0)
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      expect(wrapper.findAll('[data-testid="element-row"]')).toHaveLength(1)
    })

    it('removes an element row when delete button is clicked', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      expect(wrapper.findAll('[data-testid="element-row"]')).toHaveLength(1)
      await wrapper.find('[data-testid="element-delete-btn"]').trigger('click')
      expect(wrapper.findAll('[data-testid="element-row"]')).toHaveLength(0)
    })

    it('allows editing element name inline', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      const nameInput = wrapper.find('[data-testid="element-name"]')
      await nameInput.setValue('myField')
      expect((nameInput.element as HTMLInputElement).value).toBe('myField')
    })

    it('allows toggling the required checkbox', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      const checkbox = wrapper.find('[data-testid="element-required"]')
      expect((checkbox.element as HTMLInputElement).checked).toBe(false)
      await checkbox.trigger('click')
      expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    })

    it('adds multiple elements', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      expect(wrapper.findAll('[data-testid="element-row"]')).toHaveLength(2)
    })
  })

  // ─── Strategy config switching ─────────────────────────────────────────────

  describe('strategy config switching', () => {
    async function addElementAndSelectStrategy(wrapper: any, strategy: string) {
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      const stratSelect = wrapper.find('[data-testid="element-strategy"]')
      await stratSelect.setValue(strategy)
      await wrapper.vm.$nextTick()
    }

    it('shows faker config fields when strategy is "faker"', async () => {
      const { wrapper } = mountEditor()
      await addElementAndSelectStrategy(wrapper, 'faker')
      expect(wrapper.find('[data-testid="faker-method"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="faker-locale"]').exists()).toBe(true)
    })

    it('shows enum config when strategy is "enum"', async () => {
      const { wrapper } = mountEditor()
      await addElementAndSelectStrategy(wrapper, 'enum')
      expect(wrapper.find('[data-testid="enum-value-input"]').exists()).toBe(true)
    })

    it('shows pattern config when strategy is "pattern"', async () => {
      const { wrapper } = mountEditor()
      await addElementAndSelectStrategy(wrapper, 'pattern')
      expect(wrapper.find('[data-testid="pattern-input"]').exists()).toBe(true)
    })

    it('shows range config when strategy is "range"', async () => {
      const { wrapper } = mountEditor()
      await addElementAndSelectStrategy(wrapper, 'range')
      expect(wrapper.find('[data-testid="range-min"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="range-max"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="range-step"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="range-decimals"]').exists()).toBe(true)
    })

    it('shows constant config when strategy is "constant"', async () => {
      const { wrapper } = mountEditor()
      await addElementAndSelectStrategy(wrapper, 'constant')
      expect(wrapper.find('[data-testid="constant-value"]').exists()).toBe(true)
    })

    it('shows template config when strategy is "template"', async () => {
      const { wrapper } = mountEditor()
      await addElementAndSelectStrategy(wrapper, 'template')
      expect(wrapper.find('[data-testid="template-input"]').exists()).toBe(true)
    })

    it('shows no config fields for "random" strategy', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      // Default is random
      expect(wrapper.find('[data-testid="faker-method"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="pattern-input"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="range-min"]').exists()).toBe(false)
    })

    it('resets config fields when strategy changes', async () => {
      const { wrapper } = mountEditor()
      await addElementAndSelectStrategy(wrapper, 'faker')
      await wrapper.find('[data-testid="faker-method"]').setValue('person.firstName')
      // Switch to constant — faker fields should be gone
      await wrapper.find('[data-testid="element-strategy"]').setValue('constant')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="faker-method"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="constant-value"]').exists()).toBe(true)
    })
  })

  // ─── Nested elements ───────────────────────────────────────────────────────

  describe('nested elements (object/array)', () => {
    it('shows "Add Child" button when data type is object', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      const dataTypeSelect = wrapper.find('[data-testid="element-data-type"]')
      await dataTypeSelect.setValue('object')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="add-child-btn"]').exists()).toBe(true)
    })

    it('shows "Add Child" button when data type is array', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      await wrapper.find('[data-testid="element-data-type"]').setValue('array')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="add-child-btn"]').exists()).toBe(true)
    })

    it('does not show "Add Child" for non-object/array types', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      // Default is string
      expect(wrapper.find('[data-testid="add-child-btn"]').exists()).toBe(false)
    })

    it('adds a child element when "Add Child" is clicked', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      await wrapper.find('[data-testid="element-data-type"]').setValue('object')
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="add-child-btn"]').trigger('click')
      await wrapper.vm.$nextTick()
      // Two element rows: parent + child
      expect(wrapper.findAll('[data-testid="element-row"]')).toHaveLength(2)
    })
  })

  // ─── Constraints editor ────────────────────────────────────────────────────

  describe('constraints editor', () => {
    it('constraints section is collapsed by default', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="constraints-body"]').exists()).toBe(false)
    })

    it('expands constraints on toggle click', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect(wrapper.find('[data-testid="constraints-body"]').exists()).toBe(true)
    })

    it('collapses constraints on second toggle click', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect(wrapper.find('[data-testid="constraints-body"]').exists()).toBe(false)
    })

    it('renders constraint inputs when expanded', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect(wrapper.find('[data-testid="constraint-minLength"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="constraint-maxLength"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="constraint-pattern"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="constraint-format"]').exists()).toBe(true)
    })
  })

  // ─── Validation display ────────────────────────────────────────────────────

  describe('validation display', () => {
    it('calls schemas.validate and shows warning summary', async () => {
      const validateMock = vi.fn().mockResolvedValue({
        valid: false,
        warnings: [
          { elementPath: 'userId', message: 'Invalid faker method', severity: 'warning' }
        ]
      })
      mockAppApi({ schemas: { validate: validateMock, get: vi.fn().mockResolvedValue({
        id: 'schema-1', name: 'Test', description: '', elements: [], systemId: 'sys-1',
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'
      }) } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, {
        props: { schemaId: 'schema-1' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="validate-btn"]').trigger('click')
      await flushPromises()

      expect(validateMock).toHaveBeenCalledWith('sys-1', 'schema-1')
      expect(wrapper.find('[data-testid="validation-summary"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="validation-summary"]').text()).toContain('1 warning')
    })

    it('shows warnings inline on the relevant element', async () => {
      const schema = {
        id: 'schema-1', name: 'Test', description: '', systemId: 'sys-1',
        elements: [
          {
            name: 'userId',
            required: true,
            dataType: { type: 'string' },
            generationStrategy: { type: 'faker', config: { method: 'bad.method', locale: '' } },
            constraints: {}
          }
        ],
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const validateMock = vi.fn().mockResolvedValue({
        valid: false,
        warnings: [{ elementPath: 'userId', message: 'Invalid faker method', severity: 'warning' }]
      })
      mockAppApi({ schemas: { get: vi.fn().mockResolvedValue(schema), validate: validateMock } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, {
        props: { schemaId: 'schema-1' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="validate-btn"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="element-warnings"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="element-warnings"]').text()).toContain('Invalid faker method')
    })

    it('clears validation warnings when validate returns no warnings', async () => {
      const validateMock = vi.fn()
        .mockResolvedValueOnce({
          valid: false,
          warnings: [{ elementPath: 'x', message: 'err', severity: 'warning' }]
        })
        .mockResolvedValueOnce({ valid: true, warnings: [] })
      mockAppApi({ schemas: { validate: validateMock, get: vi.fn().mockResolvedValue({
        id: 'schema-1', name: 'T', description: '', elements: [], systemId: 'sys-1',
        createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'
      }) } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, {
        props: { schemaId: 'schema-1' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="validate-btn"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="validation-summary"]').exists()).toBe(true)

      await wrapper.find('[data-testid="validate-btn"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="validation-summary"]').exists()).toBe(false)
    })
  })

  // ─── Data type dropdown ────────────────────────────────────────────────────

  describe('data type dropdown', () => {
    it('includes all built-in types', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      const select = wrapper.find('[data-testid="element-data-type"]')
      const options = select.findAll('option').map((o) => o.element.value)
      expect(options).toEqual(expect.arrayContaining(['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']))
    })

    it('includes custom types in data type dropdown', async () => {
      mockAppApi({ customTypes: { list: vi.fn().mockResolvedValue([{ id: 'ct-1', name: 'PhoneNumber', baseType: 'string', systemId: 'sys-1', defaultStrategy: { type: 'random', config: {} } }]) } })
      const pinia = createPinia()
      const wrapper = mount(SchemaEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="add-element-btn"]').trigger('click')
      const options = wrapper.find('[data-testid="element-data-type"]').findAll('option').map((o) => o.text())
      expect(options).toContain('PhoneNumber')
    })
  })
})
