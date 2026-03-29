import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import ProfileStackPreview from '@renderer/components/ProfileEditor/ProfileStackPreview.vue'
import { useProfileStore } from '@renderer/stores/profile'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useSystemStore } from '@renderer/stores/system'
import { useUiStore } from '@renderer/stores/ui'

const PROFILE_A = {
  id: 'profile-a',
  systemId: 'sys-1',
  name: 'High-Value Order',
  overrides: [
    { elementPath: 'payload.amount', action: 'set', value: 999 },
    { elementPath: 'payload.status', action: 'set', value: 'pending' }
  ],
  createdAt: '',
  updatedAt: ''
}

const PROFILE_B = {
  id: 'profile-b',
  systemId: 'sys-1',
  name: 'Cancelled Order',
  overrides: [
    { elementPath: 'payload.status', action: 'set', value: 'cancelled' },
    { elementPath: 'payload.reason', action: 'set', value: 'refund' }
  ],
  createdAt: '',
  updatedAt: ''
}

function mockApi(overrides: Record<string, Record<string, unknown>> = {}) {
  ;(window as any).app = {
    api: {
      profiles: {
        get: vi.fn().mockImplementation((_systemId: string, profileId: string) => {
          if (profileId === 'profile-a') return Promise.resolve(PROFILE_A)
          if (profileId === 'profile-b') return Promise.resolve(PROFILE_B)
          return Promise.resolve(null)
        }),
        list: vi.fn().mockResolvedValue([]),
        ...overrides.profiles
      },
      schemas: {
        list: vi.fn().mockResolvedValue([
          { id: 'schema-1', name: 'Order Schema' }
        ]),
        get: vi.fn().mockResolvedValue({
          id: 'schema-1',
          name: 'Order Schema',
          elements: [
            { name: 'payload', dataType: { type: 'object' }, required: true, generationStrategy: { type: 'random', config: {} }, children: [
              { name: 'amount', dataType: { type: 'number' }, required: true, generationStrategy: { type: 'random', config: {} } },
              { name: 'status', dataType: { type: 'string' }, required: true, generationStrategy: { type: 'random', config: {} } },
              { name: 'reason', dataType: { type: 'string' }, required: false, generationStrategy: { type: 'random', config: {} } }
            ]}
          ]
        }),
        ...overrides.schemas
      },
      events: {
        generate: vi.fn().mockResolvedValue({
          payload: { amount: 999, status: 'cancelled', reason: 'refund' },
          warnings: []
        }),
        ...overrides.events
      },
      systems: {
        list: vi.fn().mockResolvedValue([]),
        ...overrides.systems
      },
      ...overrides
    }
  }
}

function mountPreview() {
  const pinia = createPinia()
  const wrapper = mount(ProfileStackPreview, { global: { plugins: [pinia] } })
  const profileStore = useProfileStore()
  const systemStore = useSystemStore()
  systemStore.selectedSystemId = 'sys-1'
  profileStore.setProfiles([
    { id: 'profile-a', name: 'High-Value Order' },
    { id: 'profile-b', name: 'Cancelled Order' }
  ])
  profileStore.activeProfileIds = ['profile-a', 'profile-b']
  return { wrapper, profileStore, pinia }
}

describe('ProfileStackPreview component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockApi()
    vi.restoreAllMocks()
  })

  // ─── Rendering ─────────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders the modal backdrop and modal', () => {
      const { wrapper } = mountPreview()
      expect(wrapper.find('[data-testid="stack-preview-backdrop"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="stack-preview-modal"]').exists()).toBe(true)
    })

    it('renders a close button', () => {
      const { wrapper } = mountPreview()
      expect(wrapper.find('[data-testid="stack-preview-close"]').exists()).toBe(true)
    })

    it('renders the schema selector', () => {
      const { wrapper } = mountPreview()
      expect(wrapper.find('[data-testid="schema-select"]').exists()).toBe(true)
    })

    it('renders the generate sample button', () => {
      const { wrapper } = mountPreview()
      expect(wrapper.find('[data-testid="generate-sample-btn"]').exists()).toBe(true)
    })

    it('shows the ordered profiles after loading', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const items = wrapper.findAll('[data-testid="profile-stack-item"]')
      expect(items.length).toBe(2)
      expect(items[0].text()).toContain('High-Value Order')
      expect(items[1].text()).toContain('Cancelled Order')
    })

    it('shows override count for each profile', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const items = wrapper.findAll('[data-testid="profile-stack-item"]')
      expect(items[0].text()).toContain('2 overrides')
      expect(items[1].text()).toContain('2 overrides')
    })
  })

  // ─── Reordering ────────────────────────────────────────────────────────────

  describe('reordering', () => {
    it('renders up/down buttons for each profile', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const upBtns = wrapper.findAll('[data-testid="move-up-btn"]')
      const downBtns = wrapper.findAll('[data-testid="move-down-btn"]')
      expect(upBtns.length).toBe(2)
      expect(downBtns.length).toBe(2)
    })

    it('first profile up button is disabled', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const upBtns = wrapper.findAll('[data-testid="move-up-btn"]')
      expect((upBtns[0].element as HTMLButtonElement).disabled).toBe(true)
    })

    it('last profile down button is disabled', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const downBtns = wrapper.findAll('[data-testid="move-down-btn"]')
      expect((downBtns[1].element as HTMLButtonElement).disabled).toBe(true)
    })

    it('clicking move-down on first profile swaps the order', async () => {
      const { wrapper, profileStore } = mountPreview()
      await flushPromises()
      await nextTick()
      const downBtns = wrapper.findAll('[data-testid="move-down-btn"]')
      await downBtns[0].trigger('click')
      expect(profileStore.activeProfileIds[0]).toBe('profile-b')
      expect(profileStore.activeProfileIds[1]).toBe('profile-a')
    })

    it('clicking move-up on second profile swaps the order', async () => {
      const { wrapper, profileStore } = mountPreview()
      await flushPromises()
      await nextTick()
      const upBtns = wrapper.findAll('[data-testid="move-up-btn"]')
      await upBtns[1].trigger('click')
      expect(profileStore.activeProfileIds[0]).toBe('profile-b')
      expect(profileStore.activeProfileIds[1]).toBe('profile-a')
    })
  })

  // ─── Conflict detection ────────────────────────────────────────────────────

  describe('conflict detection', () => {
    it('shows conflict warnings when multiple profiles target the same field', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      // payload.status is overridden by both profiles
      expect(wrapper.find('[data-testid="conflict-warnings"]').exists()).toBe(true)
      const conflictItems = wrapper.findAll('[data-testid="conflict-item"]')
      expect(conflictItems.length).toBeGreaterThanOrEqual(1)
      const conflictText = conflictItems[0].text()
      expect(conflictText).toContain('payload.status')
    })

    it('does not show conflict section when no conflicts exist', async () => {
      // Only activate profile-a (no conflicts)
      const pinia = createPinia()
      const wrapper = mount(ProfileStackPreview, { global: { plugins: [pinia] } })
      const profileStore = useProfileStore()
      const systemStore = useSystemStore()
      systemStore.selectedSystemId = 'sys-1'
      profileStore.setProfiles([{ id: 'profile-a', name: 'High-Value Order' }])
      profileStore.activeProfileIds = ['profile-a']
      await flushPromises()
      await nextTick()
      expect(wrapper.find('[data-testid="conflict-warnings"]').exists()).toBe(false)
    })

    it('shows which profile wins in a conflict', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const conflictItems = wrapper.findAll('[data-testid="conflict-item"]')
      const statusConflict = conflictItems.find((item) => item.text().includes('payload.status'))
      expect(statusConflict).toBeTruthy()
      // Cancelled Order comes after High-Value Order so it wins
      expect(statusConflict!.text()).toContain('Cancelled Order')
    })
  })

  // ─── Combined impact table ─────────────────────────────────────────────────

  describe('combined impact table', () => {
    it('renders impact rows for each overridden path', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const rows = wrapper.findAll('[data-testid="impact-row"]')
      // 3 unique paths: payload.amount, payload.reason, payload.status
      expect(rows.length).toBe(3)
    })

    it('shows the winning profile for each path', async () => {
      const { wrapper } = mountPreview()
      await flushPromises()
      await nextTick()
      const table = wrapper.find('[data-testid="impact-table"]')
      expect(table.text()).toContain('Cancelled Order')
      expect(table.text()).toContain('High-Value Order')
    })
  })

  // ─── Sample generation ─────────────────────────────────────────────────────

  describe('sample generation', () => {
    it('generate sample button is disabled when no schema selected', () => {
      const { wrapper } = mountPreview()
      const btn = wrapper.find('[data-testid="generate-sample-btn"]')
      expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    })

    it('calls events.generate with active profileIds in order', async () => {
      const generateMock = vi.fn().mockResolvedValue({
        payload: { amount: 999, status: 'cancelled' },
        warnings: []
      })
      mockApi({ events: { generate: generateMock } })

      const pinia = createPinia()
      const wrapper = mount(ProfileStackPreview, { global: { plugins: [pinia] } })
      const profileStore = useProfileStore()
      const systemStore = useSystemStore()
      const schemaStore = useSchemaStore()
      systemStore.selectedSystemId = 'sys-1'
      profileStore.activeProfileIds = ['profile-a', 'profile-b']
      schemaStore.schemas = [{ id: 'schema-1', name: 'Order Schema' }]

      await flushPromises()
      await nextTick()

      // Select schema
      await wrapper.find('[data-testid="schema-select"]').setValue('schema-1')
      await nextTick()

      await wrapper.find('[data-testid="generate-sample-btn"]').trigger('click')
      await flushPromises()

      expect(generateMock).toHaveBeenCalledWith(
        'sys-1',
        expect.objectContaining({
          schemaId: 'schema-1',
          profileIds: ['profile-a', 'profile-b']
        })
      )
    })

    it('displays the generated JSON payload', async () => {
      const generateMock = vi.fn().mockResolvedValue({
        payload: { amount: 999, status: 'cancelled' },
        warnings: []
      })
      mockApi({ events: { generate: generateMock } })

      const pinia = createPinia()
      const wrapper = mount(ProfileStackPreview, { global: { plugins: [pinia] } })
      const profileStore = useProfileStore()
      const systemStore = useSystemStore()
      const schemaStore = useSchemaStore()
      systemStore.selectedSystemId = 'sys-1'
      profileStore.activeProfileIds = ['profile-a', 'profile-b']
      schemaStore.schemas = [{ id: 'schema-1', name: 'Order Schema' }]

      await flushPromises()
      await nextTick()

      await wrapper.find('[data-testid="schema-select"]').setValue('schema-1')
      await nextTick()

      await wrapper.find('[data-testid="generate-sample-btn"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="sample-output"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="sample-output"]').text()).toContain('cancelled')
    })
  })

  // ─── Close behaviour ───────────────────────────────────────────────────────

  describe('close behaviour', () => {
    it('calls closeStackPreview when close button is clicked', async () => {
      const pinia = createPinia()
      const wrapper = mount(ProfileStackPreview, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      uiStore.stackPreviewOpen = true

      await wrapper.find('[data-testid="stack-preview-close"]').trigger('click')
      expect(uiStore.stackPreviewOpen).toBe(false)
    })

    it('calls closeStackPreview when backdrop is clicked', async () => {
      const pinia = createPinia()
      const wrapper = mount(ProfileStackPreview, { global: { plugins: [pinia] } })
      const uiStore = useUiStore()
      uiStore.stackPreviewOpen = true

      await wrapper.find('[data-testid="stack-preview-backdrop"]').trigger('click')
      expect(uiStore.stackPreviewOpen).toBe(false)
    })
  })
})
