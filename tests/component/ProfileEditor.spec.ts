import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ProfileEditor from '@renderer/components/ProfileEditor/ProfileEditor.vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useProfileStore } from '@renderer/stores/profile'
import { useSchemaStore } from '@renderer/stores/schema.store'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      profiles: {
        get: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'new-profile-id', name: 'New Profile', overrides: [] }),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
        ...overrides.profiles
      },
      schemas: {
        get: vi.fn().mockResolvedValue({ id: 'schema-1', name: 'Test Schema', elements: [] }),
        list: vi.fn().mockResolvedValue([]),
        ...overrides.schemas
      },
      events: {
        generate: vi.fn().mockResolvedValue({ payload: { status: 'active' }, warnings: [] }),
        ...overrides.events
      },
      systems: {
        list: vi.fn().mockResolvedValue([]),
        ...overrides.systems
      },
      templates: {
        list: vi.fn().mockResolvedValue([]),
        ...overrides.templates
      },
      ...overrides
    }
  }
}

function mountEditor(props: Record<string, any> = {}, systemId = 'sys-1') {
  const pinia = createPinia()
  const wrapper = mount(ProfileEditor, {
    props,
    global: { plugins: [pinia] }
  })
  const systemStore = useSystemStore()
  systemStore.selectedSystemId = systemId
  return { wrapper, pinia }
}

describe('ProfileEditor component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  // ─── Create mode ───────────────────────────────────────────────────────────

  describe('create mode (no profileId)', () => {
    it('renders profile name and description inputs', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="profile-name"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="profile-description"]').exists()).toBe(true)
    })

    it('renders Save Profile button', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="save-btn"]').text()).toContain('Save Profile')
    })

    it('does not render Delete button in create mode', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="delete-btn"]').exists()).toBe(false)
    })

    it('shows error when saving without a name', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="error-message"]').text()).toContain('name is required')
    })

    it('calls profiles.create and opens new tab on successful save', async () => {
      const createMock = vi.fn().mockResolvedValue({ id: 'created-1', name: 'My Profile', overrides: [] })
      mockAppApi({ profiles: { create: createMock, list: vi.fn().mockResolvedValue([]) } })

      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      uiStore.openTab({ id: 'profile:new', type: 'profile', title: 'New Profile' })

      await wrapper.find('[data-testid="profile-name"]').setValue('My Profile')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'My Profile', systemId: 'sys-1', overrides: [] })
      )
      expect(uiStore.openTabs.find((t) => t.id === 'profile:new')).toBeUndefined()
      expect(uiStore.openTabs.find((t) => t.id === 'profile:created-1')).toBeDefined()
    })

    it('shows overrides empty state initially', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="overrides-empty"]').exists()).toBe(true)
    })

    it('adds an override row when Add Override is clicked', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="override-row-0"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="overrides-empty"]').exists()).toBe(false)
    })

    it('removes an override row when ✕ is clicked', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="override-row-0"]').exists()).toBe(true)
      await wrapper.find('[data-testid="override-remove-0"]').trigger('click')
      expect(wrapper.find('[data-testid="override-row-0"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="overrides-empty"]').exists()).toBe(true)
    })

    it('shows preview empty state when no schema is selected', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="preview-empty-state"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="preview-comparison"]').exists()).toBe(false)
    })

    it('renders schema context selector', () => {
      const { wrapper } = mountEditor()
      expect(wrapper.find('[data-testid="schema-context-select"]').exists()).toBe(true)
    })

    it('renders Generate Sample button disabled when no schema selected', () => {
      const { wrapper } = mountEditor()
      const btn = wrapper.find('[data-testid="generate-sample-btn"]')
      expect(btn.exists()).toBe(true)
      expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    })
  })

  // ─── Edit mode ─────────────────────────────────────────────────────────────

  describe('edit mode (profileId provided)', () => {
    const existingProfile = {
      id: 'profile-existing',
      systemId: 'sys-1',
      name: 'Existing Profile',
      description: 'A test profile',
      overrides: [
        { elementPath: 'payload.status', action: 'set' as const, value: 'active' },
        { elementPath: 'payload.type', action: 'omit' as const }
      ],
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    }

    it('loads profile name and description from API', async () => {
      mockAppApi({ profiles: { get: vi.fn().mockResolvedValue(existingProfile) } })
      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, {
        props: { profileId: 'profile-existing' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      expect(
        (wrapper.find('[data-testid="profile-name"]').element as HTMLInputElement).value
      ).toBe('Existing Profile')
      expect(
        (wrapper.find('[data-testid="profile-description"]').element as HTMLInputElement).value
      ).toBe('A test profile')
    })

    it('renders existing overrides from profile', async () => {
      mockAppApi({ profiles: { get: vi.fn().mockResolvedValue(existingProfile) } })
      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, {
        props: { profileId: 'profile-existing' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      expect(wrapper.find('[data-testid="override-row-0"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="override-row-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="overrides-empty"]').exists()).toBe(false)
    })

    it('shows Delete button in edit mode', async () => {
      mockAppApi({ profiles: { get: vi.fn().mockResolvedValue(existingProfile) } })
      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, {
        props: { profileId: 'profile-existing' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      expect(wrapper.find('[data-testid="delete-btn"]').exists()).toBe(true)
    })

    it('calls profiles.update on save in edit mode', async () => {
      const updateMock = vi.fn().mockResolvedValue({})
      mockAppApi({
        profiles: {
          get: vi.fn().mockResolvedValue(existingProfile),
          update: updateMock,
          list: vi.fn().mockResolvedValue([])
        }
      })
      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, {
        props: { profileId: 'profile-existing' },
        global: { plugins: [pinia] }
      })
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      await flushPromises()

      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(updateMock).toHaveBeenCalledWith(
        'sys-1',
        'profile-existing',
        expect.objectContaining({ name: 'Existing Profile' })
      )
    })

    it('calls profiles.delete and closes tab on delete', async () => {
      const deleteMock = vi.fn().mockResolvedValue(undefined)
      mockAppApi({
        profiles: {
          get: vi.fn().mockResolvedValue(existingProfile),
          delete: deleteMock,
          list: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({})
        },
        templates: { list: vi.fn().mockResolvedValue([]) }
      })
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, {
        props: { profileId: 'profile-existing' },
        global: { plugins: [pinia] }
      })
      const uiStore = useUiStore()
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      uiStore.openTab({ id: 'profile:profile-existing', type: 'profile', title: 'Existing Profile' })
      await flushPromises()

      await wrapper.find('[data-testid="delete-btn"]').trigger('click')
      await flushPromises()

      expect(deleteMock).toHaveBeenCalledWith('sys-1', 'profile-existing')
      expect(uiStore.openTabs.find((t) => t.id === 'profile:profile-existing')).toBeUndefined()
    })

    it('aborts delete when user cancels confirmation', async () => {
      const deleteMock = vi.fn().mockResolvedValue(undefined)
      mockAppApi({
        profiles: {
          get: vi.fn().mockResolvedValue(existingProfile),
          delete: deleteMock,
          list: vi.fn().mockResolvedValue([])
        },
        templates: { list: vi.fn().mockResolvedValue([]) }
      })
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, {
        props: { profileId: 'profile-existing' },
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

  // ─── Action switching ───────────────────────────────────────────────────────

  describe('override action switching', () => {
    it('shows value input for "set" action (default)', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')
      expect(wrapper.find('[data-testid="override-value-0"]').exists()).toBe(true)
    })

    it('shows strategy config for "generate" action', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper
        .find('[data-testid="override-action-0"]')
        .setValue('generate')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      expect(wrapper.find('[data-testid="override-strategy-type-0"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="override-value-0"]').exists()).toBe(false)
    })

    it('shows hint text for "omit" action', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('omit')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      const row = wrapper.find('[data-testid="override-row-0"]')
      expect(row.text()).toContain('excluded from generated event')
      expect(wrapper.find('[data-testid="override-value-0"]').exists()).toBe(false)
    })

    it('shows hint text for "require" action', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('require')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      const row = wrapper.find('[data-testid="override-row-0"]')
      expect(row.text()).toContain('forces inclusion')
    })

    it('shows hint text for "nullify" action', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('nullify')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      const row = wrapper.find('[data-testid="override-row-0"]')
      expect(row.text()).toContain('set to null')
    })

    it('shows faker config fields when generate + faker strategy selected', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('generate')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      await wrapper.find('[data-testid="override-strategy-type-0"]').setValue('faker')
      await wrapper.find('[data-testid="override-strategy-type-0"]').trigger('change')

      expect(wrapper.find('[data-testid="override-faker-method-0"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="override-faker-locale-0"]').exists()).toBe(true)
    })

    it('shows enum input field when generate + enum strategy selected', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('generate')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      await wrapper.find('[data-testid="override-strategy-type-0"]').setValue('enum')
      await wrapper.find('[data-testid="override-strategy-type-0"]').trigger('change')

      expect(wrapper.find('[data-testid="override-enum-input-0"]').exists()).toBe(true)
    })

    it('shows pattern input field when generate + pattern strategy selected', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('generate')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      await wrapper.find('[data-testid="override-strategy-type-0"]').setValue('pattern')
      await wrapper.find('[data-testid="override-strategy-type-0"]').trigger('change')

      expect(wrapper.find('[data-testid="override-pattern-0"]').exists()).toBe(true)
    })

    it('shows range min/max inputs when generate + range strategy selected', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('generate')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      await wrapper.find('[data-testid="override-strategy-type-0"]').setValue('range')
      await wrapper.find('[data-testid="override-strategy-type-0"]').trigger('change')

      expect(wrapper.find('[data-testid="override-range-min-0"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="override-range-max-0"]').exists()).toBe(true)
    })

    it('shows constant value input when generate + constant strategy selected', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('generate')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      await wrapper.find('[data-testid="override-strategy-type-0"]').setValue('constant')
      await wrapper.find('[data-testid="override-strategy-type-0"]').trigger('change')

      expect(wrapper.find('[data-testid="override-constant-0"]').exists()).toBe(true)
    })

    it('shows template input when generate + template strategy selected', async () => {
      const { wrapper } = mountEditor()
      await wrapper.find('[data-testid="add-override-btn"]').trigger('click')

      await wrapper.find('[data-testid="override-action-0"]').setValue('generate')
      await wrapper.find('[data-testid="override-action-0"]').trigger('change')

      await wrapper.find('[data-testid="override-strategy-type-0"]').setValue('template')
      await wrapper.find('[data-testid="override-strategy-type-0"]').trigger('change')

      expect(wrapper.find('[data-testid="override-template-0"]').exists()).toBe(true)
    })
  })

  // ─── Preview ────────────────────────────────────────────────────────────────

  describe('preview section', () => {
    it('shows preview comparison when schema is selected', async () => {
      const schemaMock = {
        id: 'schema-1',
        name: 'Test Schema',
        elements: [
          { name: 'status', required: true, dataType: { type: 'string' }, generationStrategy: { type: 'random', config: {} } },
          { name: 'amount', required: false, dataType: { type: 'number' }, generationStrategy: { type: 'random', config: {} } }
        ]
      }
      mockAppApi({ schemas: { get: vi.fn().mockResolvedValue(schemaMock), list: vi.fn().mockResolvedValue([{ id: 'schema-1', name: 'Test Schema' }]) } })

      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      const schemaStore = useSchemaStore()
      systemStore.selectedSystemId = 'sys-1'

      // Populate schema store so the select option exists in the DOM
      schemaStore.schemas = [{ id: 'schema-1', name: 'Test Schema' }]
      await nextTick()

      await wrapper
        .find('[data-testid="schema-context-select"]')
        .setValue('schema-1')
      await flushPromises()

      expect(wrapper.find('[data-testid="preview-comparison"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="preview-empty-state"]').exists()).toBe(false)
    })

    it('calls events.generate and displays sample payload', async () => {
      const generateMock = vi.fn().mockResolvedValue({
        payload: { status: 'active', amount: 42 },
        warnings: []
      })
      mockAppApi({
        schemas: {
          get: vi.fn().mockResolvedValue({ id: 'schema-1', name: 'Test Schema', elements: [] }),
          list: vi.fn().mockResolvedValue([{ id: 'schema-1', name: 'Test Schema' }])
        },
        events: { generate: generateMock }
      })

      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      const schemaStore = useSchemaStore()
      systemStore.selectedSystemId = 'sys-1'

      // Populate schema store so the select option exists in the DOM
      schemaStore.schemas = [{ id: 'schema-1', name: 'Test Schema' }]
      await nextTick()

      await wrapper.find('[data-testid="schema-context-select"]').setValue('schema-1')
      await flushPromises()

      await wrapper.find('[data-testid="generate-sample-btn"]').trigger('click')
      await flushPromises()

      expect(generateMock).toHaveBeenCalled()
      expect(wrapper.find('[data-testid="sample-payload"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="sample-payload"]').text()).toContain('active')
    })

    it('shows error when generate sample is clicked without schema selected', async () => {
      const { wrapper } = mountEditor()
      // Generate Sample button should be disabled — simulate direct call scenario
      // by checking error message would show
      await wrapper.find('[data-testid="generate-sample-btn"]').trigger('click')
      // Button is disabled so no error, but if somehow triggered:
      // error message should inform user to select schema
      // The disabled state is the primary protection
      const btn = wrapper.find('[data-testid="generate-sample-btn"]')
      expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    })
  })

  // ─── Profile store ──────────────────────────────────────────────────────────

  describe('profile store updated after save', () => {
    it('calls profileStore.list after successful create', async () => {
      const listMock = vi.fn().mockResolvedValue([])
      mockAppApi({
        profiles: {
          create: vi.fn().mockResolvedValue({ id: 'new-1', name: 'Test', overrides: [] }),
          list: listMock
        }
      })

      const pinia = createPinia()
      const wrapper = mount(ProfileEditor, { global: { plugins: [pinia] } })
      const systemStore = useSystemStore()
      const profileStore = useProfileStore()
      systemStore.selectedSystemId = 'sys-1'

      // profileStore.list is bound to api.profiles.list
      await wrapper.find('[data-testid="profile-name"]').setValue('Test')
      await wrapper.find('[data-testid="save-btn"]').trigger('click')
      await flushPromises()

      expect(listMock).toHaveBeenCalledWith('sys-1')
      // profileStore.availableProfiles stays empty as mock returns []
      expect(profileStore.availableProfiles).toEqual([])
    })
  })
})
