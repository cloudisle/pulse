import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EnvironmentEditor from '@renderer/components/EnvironmentEditor/EnvironmentEditor.vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      environments: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-env-id', name: 'Test' }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
        ...overrides.environments
      },
      ...overrides
    }
  }
}

function mountComponent(props: Record<string, any> = {}, pinia = createPinia()) {
  return mount(EnvironmentEditor, { props, global: { plugins: [pinia] } })
}

const existingEnv = {
  id: 'env-1',
  systemId: 'sys-1',
  name: 'Production',
  variables: [
    { key: 'API_URL', value: 'https://api.example.com', sensitive: false },
    { key: 'SECRET_KEY', value: 'supersecret', sensitive: true }
  ],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
}

describe('EnvironmentEditor component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  describe('rendering', () => {
    it('renders the name input and Save button', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.env-editor__name-input').exists()).toBe(true)
      expect(wrapper.find('.env-editor__btn--primary').exists()).toBe(true)
      expect(wrapper.find('.env-editor__btn--primary').text()).toBe('Save')
    })

    it('renders the Add Variable button', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.env-editor__add-btn').exists()).toBe(true)
    })

    it('shows "No variables defined" when no variables exist', () => {
      const wrapper = mountComponent()
      expect(wrapper.find('.env-editor__empty').exists()).toBe(true)
    })

    it('loads and displays environment data in edit mode', async () => {
      mockAppApi({ environments: { get: vi.fn().mockResolvedValue(existingEnv) } })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'

      const wrapper = mountComponent({ environmentId: 'env-1' }, pinia)
      await flushPromises()

      expect((wrapper.find('.env-editor__name-input').element as HTMLInputElement).value).toBe(
        'Production'
      )
      expect(wrapper.findAll('[data-testid="variable-row"]')).toHaveLength(2)
    })
  })

  describe('masking of sensitive values', () => {
    it('masks sensitive variable values by default', async () => {
      mockAppApi({ environments: { get: vi.fn().mockResolvedValue(existingEnv) } })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'

      const wrapper = mountComponent({ environmentId: 'env-1' }, pinia)
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="variable-row"]')
      const sensitiveRow = rows[1]
      expect(sensitiveRow.find('.env-editor__masked').exists()).toBe(true)
      expect(sensitiveRow.find('.env-editor__masked').text()).toBe('••••••••')
      expect(sensitiveRow.find('input[aria-label="Variable value"]').exists()).toBe(false)
    })

    it('shows non-sensitive values as plain text inputs', async () => {
      mockAppApi({ environments: { get: vi.fn().mockResolvedValue(existingEnv) } })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'

      const wrapper = mountComponent({ environmentId: 'env-1' }, pinia)
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="variable-row"]')
      const nonSensitiveRow = rows[0]
      expect(nonSensitiveRow.find('.env-editor__masked').exists()).toBe(false)
      expect(nonSensitiveRow.find('input[aria-label="Variable value"]').exists()).toBe(true)
    })

    it('reveals sensitive value when toggle button is clicked', async () => {
      mockAppApi({ environments: { get: vi.fn().mockResolvedValue(existingEnv) } })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'

      const wrapper = mountComponent({ environmentId: 'env-1' }, pinia)
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="variable-row"]')
      const sensitiveRow = rows[1]

      await sensitiveRow.find('.env-editor__reveal-btn').trigger('click')
      await wrapper.vm.$nextTick()

      expect(sensitiveRow.find('.env-editor__masked').exists()).toBe(false)
      expect(sensitiveRow.find('input[aria-label="Variable value"]').exists()).toBe(true)
    })

    it('hides revealed value again when toggle is clicked a second time', async () => {
      mockAppApi({ environments: { get: vi.fn().mockResolvedValue(existingEnv) } })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'

      const wrapper = mountComponent({ environmentId: 'env-1' }, pinia)
      await flushPromises()

      const rows = wrapper.findAll('[data-testid="variable-row"]')
      const sensitiveRow = rows[1]

      await sensitiveRow.find('.env-editor__reveal-btn').trigger('click')
      await wrapper.vm.$nextTick()
      await sensitiveRow.find('.env-editor__reveal-btn').trigger('click')
      await wrapper.vm.$nextTick()

      expect(sensitiveRow.find('.env-editor__masked').exists()).toBe(true)
    })
  })

  describe('add, edit and delete variables', () => {
    it('adds a new variable row when Add Variable is clicked', async () => {
      const wrapper = mountComponent()
      expect(wrapper.findAll('[data-testid="variable-row"]')).toHaveLength(0)
      await wrapper.find('.env-editor__add-btn').trigger('click')
      expect(wrapper.findAll('[data-testid="variable-row"]')).toHaveLength(1)
    })

    it('removes a variable row when delete button is clicked', async () => {
      const wrapper = mountComponent()
      await wrapper.find('.env-editor__add-btn').trigger('click')
      expect(wrapper.findAll('[data-testid="variable-row"]')).toHaveLength(1)
      await wrapper.find('[data-testid="variable-row"] .env-editor__delete-btn').trigger('click')
      expect(wrapper.findAll('[data-testid="variable-row"]')).toHaveLength(0)
    })

    it('allows editing the key and value of a variable', async () => {
      const wrapper = mountComponent()
      await wrapper.find('.env-editor__add-btn').trigger('click')
      const row = wrapper.find('[data-testid="variable-row"]')
      await row.find('input[aria-label="Variable key"]').setValue('MY_KEY')
      await row.find('input[aria-label="Variable value"]').setValue('my-value')
      expect((row.find('input[aria-label="Variable key"]').element as HTMLInputElement).value).toBe(
        'MY_KEY'
      )
      expect(
        (row.find('input[aria-label="Variable value"]').element as HTMLInputElement).value
      ).toBe('my-value')
    })

    it('masks value immediately when sensitive checkbox is checked', async () => {
      const wrapper = mountComponent()
      await wrapper.find('.env-editor__add-btn').trigger('click')
      const row = wrapper.find('[data-testid="variable-row"]')
      await row.find('input[aria-label="Variable value"]').setValue('secret')
      await row.find('input[aria-label="Sensitive"]').setValue(true)
      await wrapper.vm.$nextTick()
      expect(row.find('.env-editor__masked').exists()).toBe(true)
    })
  })

  describe('save', () => {
    it('shows error when saving without a name', async () => {
      const wrapper = mountComponent()
      await wrapper.find('.env-editor__btn--primary').trigger('click')
      expect(wrapper.find('.env-editor__error').exists()).toBe(true)
      expect(wrapper.find('.env-editor__error').text()).toContain('name is required')
    })

    it('calls environments.update in edit mode and updates tab title', async () => {
      const updateMock = vi.fn().mockResolvedValue({})
      mockAppApi({
        environments: {
          get: vi.fn().mockResolvedValue(existingEnv),
          update: updateMock,
          list: vi.fn().mockResolvedValue([existingEnv])
        }
      })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'
      const uiStore = useUiStore(pinia)
      uiStore.openTab({ id: 'environment:env-1', type: 'environment', title: 'Production' })

      const wrapper = mountComponent({ environmentId: 'env-1' }, pinia)
      await flushPromises()

      await wrapper.find('.env-editor__btn--primary').trigger('click')
      await flushPromises()

      expect(updateMock).toHaveBeenCalledWith(
        'sys-1',
        'env-1',
        expect.objectContaining({ name: 'Production' })
      )
    })

    it('persists all variable data on save', async () => {
      const updateMock = vi.fn().mockResolvedValue({})
      mockAppApi({
        environments: {
          get: vi.fn().mockResolvedValue(existingEnv),
          update: updateMock,
          list: vi.fn().mockResolvedValue([existingEnv])
        }
      })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'
      useUiStore(pinia)

      const wrapper = mountComponent({ environmentId: 'env-1' }, pinia)
      await flushPromises()

      await wrapper.find('.env-editor__btn--primary').trigger('click')
      await flushPromises()

      expect(updateMock).toHaveBeenCalledWith(
        'sys-1',
        'env-1',
        expect.objectContaining({
          variables: expect.arrayContaining([
            expect.objectContaining({ key: 'API_URL', value: 'https://api.example.com', sensitive: false }),
            expect.objectContaining({ key: 'SECRET_KEY', value: 'supersecret', sensitive: true })
          ])
        })
      )
    })

    it('calls environments.create in create mode and closes tab', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'new-env', name: 'Dev' })
      mockAppApi({
        environments: { create: createMock, list: vi.fn().mockResolvedValue([]) }
      })
      const pinia = createPinia()
      const systemStore = useSystemStore(pinia)
      systemStore.selectedSystemId = 'sys-1'
      const uiStore = useUiStore(pinia)
      uiStore.openTab({ id: 'environment:new', type: 'environment', title: 'New Environment' })

      const wrapper = mountComponent({}, pinia)
      await wrapper.find('.env-editor__name-input').setValue('Dev')
      await wrapper.find('.env-editor__btn--primary').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ systemId: 'sys-1', name: 'Dev' })
      )
      expect(uiStore.openTabs.find((t) => t.id === 'environment:new')).toBeUndefined()
    })
  })
})
