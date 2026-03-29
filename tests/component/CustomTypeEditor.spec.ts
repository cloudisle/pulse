import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CustomTypeEditor from '@renderer/components/CustomTypeEditor/CustomTypeEditor.vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      customTypes: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'ct-new', name: 'MyType' }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({ warnings: [] }),
        ...overrides.customTypes
      },
      ...overrides
    }
  }
}

function mountEditor(props: Record<string, any> = {}, systemId = 'sys-1') {
  const pinia = createPinia()
  const wrapper = mount(CustomTypeEditor, {
    props,
    global: { plugins: [pinia] }
  })
  const systemStore = useSystemStore()
  systemStore.selectedSystemId = systemId
  return { wrapper, pinia }
}

describe('CustomTypeEditor component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  // ─── Create mode ───────────────────────────────────────────────────────────

  describe('create mode (no customTypeId)', () => {
    it('renders "New Custom Type" title in create mode', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('.custom-type-editor__title').text()).toBe('New Custom Type')
    })

    it('does not show Delete button in create mode', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="delete-btn"]').exists()).toBe(false)
    })

    it('renders name input, base type selector, and strategy selector', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="custom-type-name"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="custom-type-base-type"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="custom-type-strategy"]').exists()).toBe(true)
    })

    it('includes all built-in base types in the dropdown', () => {
      const { wrapper } = mountEditor()
      const options = wrapper.find('[data-testid="custom-type-base-type"]').findAll('option').map((o) => o.element.value)
      expect(options).toEqual(['string', 'integer', 'number', 'boolean', 'object', 'array', 'null'])
    })

    it('includes all strategy types in the strategy dropdown', () => {
      const { wrapper } = mountEditor()
      const options = wrapper.find('[data-testid="custom-type-strategy"]').findAll('option').map((o) => o.element.value)
      expect(options).toEqual(expect.arrayContaining(['random', 'faker', 'enum', 'pattern', 'range', 'constant', 'template']))
    })

    it('shows error when saving without a name', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="error-message"]').text()).toContain('Name is required')
    })

    it('calls customTypes.create and opens new tab on successful save', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'ct-created', name: 'PhoneNumber' })
      mockAppApi({ customTypes: { create: createMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      uiStore.openTab({ id: 'custom-type:new', type: 'custom-type', title: 'New Custom Type' })

      await wrapper.find('[data-testid="custom-type-name"]').setValue('PhoneNumber')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          systemId: 'sys-1',
          name: 'PhoneNumber',
          baseType: 'string',
          defaultStrategy: expect.objectContaining({ type: 'random' })
        })
      )
      expect(uiStore.openTabs.find((t) => t.id === 'custom-type:new')).toBeUndefined()
      expect(uiStore.openTabs.find((t) => t.id === 'custom-type:ct-created')).toBeDefined()
    })
  })

  // ─── Edit mode ────────────────────────────────────────────────────────────

  describe('edit mode (with customTypeId)', () => {
    const EXISTING_CT = {
      id: 'ct-1',
      systemId: 'sys-1',
      name: 'PhoneNumber',
      baseType: 'string',
      defaultStrategy: { type: 'pattern', config: { pattern: '\\d{3}-\\d{4}' } },
      constraints: { minLength: 8, maxLength: 12 }
    }

    it('renders "Edit Custom Type" title in edit mode', async () => {
      mockAppApi({ customTypes: { get: vi.fn().mockResolvedValue(EXISTING_CT) } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, {
        props: { customTypeId: 'ct-1' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()
      expect(wrapper.find('.custom-type-editor__title').text()).toBe('Edit Custom Type')
    })

    it('populates fields from the loaded custom type', async () => {
      mockAppApi({ customTypes: { get: vi.fn().mockResolvedValue(EXISTING_CT) } })
      const pinia = createPinia()
      setActivePinia(pinia)
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      const wrapper = mount(CustomTypeEditor, {
        props: { customTypeId: 'ct-1' },
        global: { plugins: [pinia] }
      })
      await flushPromises()

      expect((wrapper.find('[data-testid="custom-type-name"]').element as HTMLInputElement).value).toBe('PhoneNumber')
      expect((wrapper.find('[data-testid="custom-type-base-type"]').element as HTMLSelectElement).value).toBe('string')
      expect((wrapper.find('[data-testid="custom-type-strategy"]').element as HTMLSelectElement).value).toBe('pattern')
      expect((wrapper.find('[data-testid="pattern-input"]').element as HTMLInputElement).value).toBe('\\d{3}-\\d{4}')
    })

    it('shows Delete button in edit mode', async () => {
      mockAppApi({ customTypes: { get: vi.fn().mockResolvedValue(EXISTING_CT) } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, {
        props: { customTypeId: 'ct-1' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()
      expect(wrapper.find('[data-testid="delete-btn"]').exists()).toBe(true)
    })

    it('calls customTypes.update on save in edit mode', async () => {
      const updateMock = vi.fn().mockResolvedValue({ ...EXISTING_CT, name: 'UpdatedPhone' })
      mockAppApi({ customTypes: { get: vi.fn().mockResolvedValue(EXISTING_CT), update: updateMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, {
        props: { customTypeId: 'ct-1' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="custom-type-name"]').setValue('UpdatedPhone')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(updateMock).toHaveBeenCalledWith('sys-1', 'ct-1', expect.objectContaining({ name: 'UpdatedPhone' }))
    })

    it('calls customTypes.delete and closes tab on delete confirm', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
      const deleteMock = vi.fn().mockResolvedValue({ warnings: [] })
      mockAppApi({ customTypes: { get: vi.fn().mockResolvedValue(EXISTING_CT), delete: deleteMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, {
        props: { customTypeId: 'ct-1' },
        global: { plugins: [pinia] }
      })
      const uiStore = useUiStore()
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      uiStore.openTab({ id: 'custom-type:ct-1', type: 'custom-type', title: 'PhoneNumber' })
      await flushPromises()

      await wrapper.find('[data-testid="delete-btn"]').trigger('click')
      await flushPromises()

      expect(deleteMock).toHaveBeenCalledWith('sys-1', 'ct-1')
      expect(uiStore.openTabs.find((t) => t.id === 'custom-type:ct-1')).toBeUndefined()
    })

    it('does not delete when user cancels the confirm dialog', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(false))
      const deleteMock = vi.fn()
      mockAppApi({ customTypes: { get: vi.fn().mockResolvedValue(EXISTING_CT), delete: deleteMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, {
        props: { customTypeId: 'ct-1' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="delete-btn"]').trigger('click')
      await flushPromises()

      expect(deleteMock).not.toHaveBeenCalled()
    })
  })

  // ─── Strategy config ──────────────────────────────────────────────────────

  describe('strategy config rendering', () => {
    it('shows faker config fields when strategy is faker', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('faker')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="faker-method"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="faker-locale"]').exists()).toBe(true)
    })

    it('shows pattern input when strategy is pattern', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('pattern')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="pattern-input"]').exists()).toBe(true)
    })

    it('shows range config fields when strategy is range', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('range')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="range-min"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="range-max"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="range-step"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="range-decimals"]').exists()).toBe(true)
    })

    it('shows constant value input when strategy is constant', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('constant')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="constant-value"]').exists()).toBe(true)
    })

    it('shows template input when strategy is template', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('template')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="template-input"]').exists()).toBe(true)
    })

    it('shows enum tags and input when strategy is enum', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('enum')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="enum-tags"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="enum-value-input"]').exists()).toBe(true)
    })

    it('adds enum values on Enter key', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('enum')
      await wrapper.vm.$nextTick()
      const input = wrapper.find('[data-testid="enum-value-input"]')
      await input.setValue('active')
      await input.trigger('keydown', { key: 'Enter' })
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="enum-tags"]').text()).toContain('active')
    })

    it('removes an enum value when × is clicked', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('enum')
      await wrapper.vm.$nextTick()
      const input = wrapper.find('[data-testid="enum-value-input"]')
      await input.setValue('active')
      await input.trigger('keydown', { key: 'Enter' })
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="enum-tags"]').text()).toContain('active')
      await wrapper.find('[data-testid="enum-tag-remove"]').trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('[data-testid="enum-tags"]').text()).not.toContain('active')
    })

    it('includes pattern config in the payload when strategy is pattern', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'ct-pat', name: 'PatternType' })
      mockAppApi({ customTypes: { create: createMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'

      await wrapper.find('[data-testid="custom-type-name"]').setValue('PatternType')
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('pattern')
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="pattern-input"]').setValue('[A-Z]{3}-\\d{4}')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultStrategy: { type: 'pattern', config: { pattern: '[A-Z]{3}-\\d{4}' } }
        })
      )
    })

    it('includes faker config in the payload when strategy is faker', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'ct-fkr', name: 'FakerType' })
      mockAppApi({ customTypes: { create: createMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'

      await wrapper.find('[data-testid="custom-type-name"]').setValue('FakerType')
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('faker')
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="faker-method"]').setValue('person.firstName')
      await wrapper.find('[data-testid="faker-locale"]').setValue('en')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultStrategy: { type: 'faker', config: { method: 'person.firstName', locale: 'en' } }
        })
      )
    })

    it('includes enum values in the payload when strategy is enum', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'ct-enm', name: 'StatusType' })
      mockAppApi({ customTypes: { create: createMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'

      await wrapper.find('[data-testid="custom-type-name"]').setValue('StatusType')
      await wrapper.find('[data-testid="custom-type-strategy"]').setValue('enum')
      await wrapper.vm.$nextTick()
      const enumInput = wrapper.find('[data-testid="enum-value-input"]')
      await enumInput.setValue('active')
      await enumInput.trigger('keydown', { key: 'Enter' })
      await wrapper.vm.$nextTick()
      await enumInput.setValue('inactive')
      await enumInput.trigger('keydown', { key: 'Enter' })
      await wrapper.vm.$nextTick()
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultStrategy: { type: 'enum', config: { values: ['active', 'inactive'] } }
        })
      )
    })
  })

  // ─── Constraints ─────────────────────────────────────────────────────────

  describe('constraints editing', () => {
    it('constraints section is collapsed by default', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="constraints-body"]').exists()).toBe(false)
    })

    it('expands constraints when toggle is clicked', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect(wrapper.find('[data-testid="constraints-body"]').exists()).toBe(true)
    })

    it('renders all constraint fields when expanded', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect(wrapper.find('[data-testid="constraint-minLength"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="constraint-maxLength"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="constraint-pattern"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="constraint-format"]').exists()).toBe(true)
    })

    it('collapses constraints when toggle is clicked again', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect(wrapper.find('[data-testid="constraints-body"]').exists()).toBe(true)
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect(wrapper.find('[data-testid="constraints-body"]').exists()).toBe(false)
    })

    it('includes constraints in the payload on save', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'ct-99', name: 'ConstrainedType' })
      mockAppApi({ customTypes: { create: createMock } })
      const pinia = createPinia()
      const wrapper = mount(CustomTypeEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'

      await wrapper.find('[data-testid="custom-type-name"]').setValue('ConstrainedType')
      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      await wrapper.find('[data-testid="constraint-minLength"]').setValue('5')
      await wrapper.find('[data-testid="constraint-format"]').setValue('email')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          constraints: expect.objectContaining({ minLength: 5, format: 'email' })
        })
      )
    })

    it('pre-populates constraints from loaded custom type', async () => {
      const ct = {
        id: 'ct-1',
        systemId: 'sys-1',
        name: 'Constrained',
        baseType: 'string',
        defaultStrategy: { type: 'random', config: {} },
        constraints: { minLength: 3, maxLength: 50, format: 'email' }
      }
      mockAppApi({ customTypes: { get: vi.fn().mockResolvedValue(ct) } })
      const pinia = createPinia()
      setActivePinia(pinia)
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      const wrapper = mount(CustomTypeEditor, {
        props: { customTypeId: 'ct-1' },
        global: { plugins: [pinia] }
      })
      await flushPromises()

      await wrapper.find('[data-testid="constraints-toggle"]').trigger('click')
      expect((wrapper.find('[data-testid="constraint-minLength"]').element as HTMLInputElement).value).toBe('3')
      expect((wrapper.find('[data-testid="constraint-maxLength"]').element as HTMLInputElement).value).toBe('50')
      expect((wrapper.find('[data-testid="constraint-format"]').element as HTMLInputElement).value).toBe('email')
    })
  })
})
