import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SystemEditor from '@renderer/components/SystemEditor/SystemEditor.vue'
import { useUiStore } from '@renderer/stores/ui'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      systems: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-sys-id', name: 'Test' }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
        ...overrides.systems
      },
      ...overrides
    }
  }
}

describe('SystemEditor component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  describe('create flow', () => {
    it('renders "New System" title in create mode', () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      expect(wrapper.find('.system-editor__title').text()).toBe('New System')
    })

    it('does not show Delete button in create mode', () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      expect(wrapper.find('.system-editor__btn--danger').exists()).toBe(false)
    })

    it('shows error when saving without a name', async () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      await wrapper.find('.system-editor__btn--primary').trigger('click')
      expect(wrapper.find('.system-editor__error').exists()).toBe(true)
      expect(wrapper.find('.system-editor__error').text()).toContain('name is required')
    })

    it('calls systems.create and closes tab on successful save', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'sys-1', name: 'New Sys' })
      mockAppApi({ systems: { create: createMock, list: vi.fn().mockResolvedValue([]) } })
      const pinia = createPinia()
      const wrapper = mount(SystemEditor, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      uiStore.openTab({ id: 'system:new', type: 'system', title: 'New System' })

      await wrapper.find('#sys-name').setValue('New Sys')
      await wrapper.find('.system-editor__btn--primary').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Sys', inputs: [], outputs: [] })
      )
      expect(uiStore.openTabs.find((t) => t.id === 'system:new')).toBeUndefined()
    })

    it('adds an input row when "Add Input" is clicked', async () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      expect(wrapper.findAll('[data-testid="input-row"]')).toHaveLength(0)
      await wrapper.findAll('.system-editor__add-btn')[0].trigger('click')
      expect(wrapper.findAll('[data-testid="input-row"]')).toHaveLength(1)
    })

    it('adds an output row when "Add Output" is clicked', async () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      expect(wrapper.findAll('[data-testid="output-row"]')).toHaveLength(0)
      await wrapper.findAll('.system-editor__add-btn')[1].trigger('click')
      expect(wrapper.findAll('[data-testid="output-row"]')).toHaveLength(1)
    })

    it('removes an input row when delete button is clicked', async () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      await wrapper.findAll('.system-editor__add-btn')[0].trigger('click')
      expect(wrapper.findAll('[data-testid="input-row"]')).toHaveLength(1)
      await wrapper.find('[data-testid="input-row"] .system-editor__delete-btn').trigger('click')
      expect(wrapper.findAll('[data-testid="input-row"]')).toHaveLength(0)
    })

    it('sends inputs and outputs data on create', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'sys-1', name: 'Sys' })
      mockAppApi({ systems: { create: createMock, list: vi.fn().mockResolvedValue([]) } })
      const pinia = createPinia()
      const wrapper = mount(SystemEditor, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      uiStore.openTab({ id: 'system:new', type: 'system', title: 'New System' })

      await wrapper.find('#sys-name').setValue('Sys')
      // Add one input
      await wrapper.findAll('.system-editor__add-btn')[0].trigger('click')
      const inputRow = wrapper.find('[data-testid="input-row"]')
      await inputRow.find('input').setValue('MyInput')

      await wrapper.find('.system-editor__btn--primary').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sys',
          inputs: expect.arrayContaining([expect.objectContaining({ name: 'MyInput', type: 'kinesis' })])
        })
      )
    })
  })

  describe('edit flow', () => {
    const existingSystem = {
      id: 'sys-existing',
      name: 'Existing System',
      description: 'A description',
      inputs: [
        {
          id: 'inp-1',
          name: 'MyInput',
          type: 'kinesis',
          config: { streamName: 'my-stream', region: 'us-east-1', partitionKey: '' }
        }
      ],
      outputs: [
        {
          id: 'out-1',
          name: 'MyOutput',
          type: 'sqs',
          config: { queueUrl: 'https://sqs.us-east-1.amazonaws.com/123/queue', region: 'us-east-1' },
          contentType: 'json'
        }
      ]
    }

    it('renders "Edit System" title in edit mode', async () => {
      mockAppApi({ systems: { get: vi.fn().mockResolvedValue(existingSystem) } })
      const wrapper = mount(SystemEditor, {
        props: { systemId: 'sys-existing' },
        global: { plugins: [createPinia()] }
      })
      await flushPromises()
      expect(wrapper.find('.system-editor__title').text()).toBe('Edit System')
    })

    it('shows Delete button in edit mode', async () => {
      mockAppApi({ systems: { get: vi.fn().mockResolvedValue(existingSystem) } })
      const wrapper = mount(SystemEditor, {
        props: { systemId: 'sys-existing' },
        global: { plugins: [createPinia()] }
      })
      await flushPromises()
      expect(wrapper.find('.system-editor__btn--danger').exists()).toBe(true)
    })

    it('loads system data into form fields', async () => {
      mockAppApi({ systems: { get: vi.fn().mockResolvedValue(existingSystem) } })
      const wrapper = mount(SystemEditor, {
        props: { systemId: 'sys-existing' },
        global: { plugins: [createPinia()] }
      })
      await flushPromises()
      expect((wrapper.find('#sys-name').element as HTMLInputElement).value).toBe('Existing System')
      expect((wrapper.find('#sys-desc').element as HTMLTextAreaElement).value).toBe('A description')
    })

    it('loads existing inputs and outputs', async () => {
      mockAppApi({ systems: { get: vi.fn().mockResolvedValue(existingSystem) } })
      const wrapper = mount(SystemEditor, {
        props: { systemId: 'sys-existing' },
        global: { plugins: [createPinia()] }
      })
      await flushPromises()
      expect(wrapper.findAll('[data-testid="input-row"]')).toHaveLength(1)
      expect(wrapper.findAll('[data-testid="output-row"]')).toHaveLength(1)
    })

    it('calls systems.update on save in edit mode', async () => {
      const updateMock = vi.fn().mockResolvedValue({})
      mockAppApi({
        systems: {
          get: vi.fn().mockResolvedValue(existingSystem),
          update: updateMock,
          list: vi.fn().mockResolvedValue([existingSystem])
        }
      })
      const pinia = createPinia()
      const wrapper = mount(SystemEditor, {
        props: { systemId: 'sys-existing' },
        global: { plugins: [pinia] }
      })
      const uiStore = useUiStore()
      uiStore.openTab({ id: 'system:sys-existing', type: 'system', title: 'Existing System' })
      await flushPromises()

      await wrapper.find('.system-editor__btn--primary').trigger('click')
      await flushPromises()

      expect(updateMock).toHaveBeenCalledWith(
        'sys-existing',
        expect.objectContaining({ name: 'Existing System' })
      )
    })

    it('calls systems.delete and closes tab after confirmation', async () => {
      const deleteMock = vi.fn().mockResolvedValue(undefined)
      mockAppApi({
        systems: {
          get: vi.fn().mockResolvedValue(existingSystem),
          delete: deleteMock,
          list: vi.fn().mockResolvedValue([])
        }
      })
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const pinia = createPinia()
      const wrapper = mount(SystemEditor, {
        props: { systemId: 'sys-existing' },
        global: { plugins: [pinia] }
      })
      const uiStore = useUiStore()
      uiStore.openTab({ id: 'system:sys-existing', type: 'system', title: 'Existing System' })
      await flushPromises()

      await wrapper.find('.system-editor__btn--danger').trigger('click')
      await flushPromises()

      expect(deleteMock).toHaveBeenCalledWith('sys-existing')
      expect(uiStore.openTabs.find((t) => t.id === 'system:sys-existing')).toBeUndefined()
    })

    it('does not delete if user cancels the confirmation', async () => {
      const deleteMock = vi.fn().mockResolvedValue(undefined)
      mockAppApi({
        systems: {
          get: vi.fn().mockResolvedValue(existingSystem),
          delete: deleteMock,
          list: vi.fn().mockResolvedValue([])
        }
      })
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      const pinia = createPinia()
      const wrapper = mount(SystemEditor, {
        props: { systemId: 'sys-existing' },
        global: { plugins: [pinia] }
      })
      await flushPromises()

      await wrapper.find('.system-editor__btn--danger').trigger('click')
      await flushPromises()

      expect(deleteMock).not.toHaveBeenCalled()
    })
  })

  describe('input/output type switching', () => {
    it('switches input config fields when type changes from kinesis to sqs', async () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      // Add an input row (defaults to kinesis)
      await wrapper.findAll('.system-editor__add-btn')[0].trigger('click')
      const inputRow = wrapper.find('[data-testid="input-row"]')
      // Kinesis fields should be visible
      expect(inputRow.text()).toContain('streamName')

      // Change to sqs
      const typeSelect = inputRow.find('select')
      await typeSelect.setValue('sqs')
      await wrapper.vm.$nextTick()

      expect(inputRow.text()).toContain('queueUrl')
      expect(inputRow.text()).not.toContain('streamName')
    })

    it('switches input config fields when type changes to eventbridge', async () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      await wrapper.findAll('.system-editor__add-btn')[0].trigger('click')
      const inputRow = wrapper.find('[data-testid="input-row"]')

      const typeSelect = inputRow.find('select')
      await typeSelect.setValue('eventbridge')
      await wrapper.vm.$nextTick()

      expect(inputRow.text()).toContain('eventBusName')
      expect(inputRow.text()).toContain('source')
      expect(inputRow.text()).toContain('detailType')
    })

    it('switches output config fields when type changes from kinesis to sqs', async () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      await wrapper.findAll('.system-editor__add-btn')[1].trigger('click')
      const outputRow = wrapper.find('[data-testid="output-row"]')
      expect(outputRow.text()).toContain('streamName')

      const typeSelect = outputRow.find('select')
      await typeSelect.setValue('sqs')
      await wrapper.vm.$nextTick()

      expect(outputRow.text()).toContain('queueUrl')
      expect(outputRow.text()).not.toContain('streamName')
    })
  })

  describe('variable placeholder support', () => {
    it('shows hint about {{ variable }} syntax', () => {
      const wrapper = mount(SystemEditor, { global: { plugins: [createPinia()] } })
      const hints = wrapper.findAll('.system-editor__hint')
      expect(hints.length).toBeGreaterThan(0)
      expect(hints[0].text()).toContain('{{ variable }}')
    })

    it('accepts {{ variable }} syntax in config fields', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'sys-1', name: 'S' })
      mockAppApi({ systems: { create: createMock, list: vi.fn().mockResolvedValue([]) } })
      const pinia = createPinia()
      const wrapper = mount(SystemEditor, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      uiStore.openTab({ id: 'system:new', type: 'system', title: 'New System' })

      await wrapper.find('#sys-name').setValue('S')
      await wrapper.findAll('.system-editor__add-btn')[0].trigger('click')
      const inputRow = wrapper.find('[data-testid="input-row"]')
      // Set streamName to a variable placeholder
      const configInputs = inputRow.findAll('.system-editor__config-fields input')
      await configInputs[0].setValue('{{ streamName }}')

      await wrapper.find('.system-editor__btn--primary').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          inputs: expect.arrayContaining([
            expect.objectContaining({ config: expect.objectContaining({ streamName: '{{ streamName }}' }) })
          ])
        })
      )
    })
  })
})
