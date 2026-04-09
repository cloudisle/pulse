import { beforeEach, describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OpenApiImportModal from '@renderer/components/OpenApiImport/OpenApiImportModal.vue'
import { useOpenApiImportStore } from '@renderer/stores/openapi-import.store'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useSystemStore } from '@renderer/stores/system'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      schemas: {
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        list: vi.fn().mockResolvedValue([]),
        ...overrides.schemas
      },
      customTypes: {
        list: vi.fn().mockResolvedValue([]),
        ...overrides.customTypes
      },
      openapiImport: {
        parseFile: vi.fn().mockResolvedValue({ schemas: [] }),
        ...overrides.openapiImport
      },
      ...overrides
    }
  }
}

function mountModal() {
  const pinia = createPinia()
  const wrapper = mount(OpenApiImportModal, {
    global: {
      plugins: [pinia],
      stubs: {
        SchemaElementRow: true
      }
    },
    attachTo: document.body
  })
  const store = useOpenApiImportStore()
  const schemaStore = useSchemaStore()
  const systemStore = useSystemStore()
  systemStore.selectedSystemId = 'sys-1'
  return { wrapper, store, schemaStore, pinia }
}

describe('OpenApiImportModal component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the overlay element', () => {
    mountModal()
    expect(document.body.querySelector('[data-testid="oai-overlay"]')).not.toBeNull()
  })

  describe('Step 1: provide', () => {
    it('renders textarea and Choose File button', () => {
      mountModal()
      expect(document.body.querySelector('[data-testid="paste-textarea"]')).not.toBeNull()
      expect(document.body.querySelector('[data-testid="choose-file-btn"]')).not.toBeNull()
    })

    it('Parse button is disabled when textarea is empty', () => {
      mountModal()
      const parseBtn = document.body.querySelector('[data-testid="parse-btn"]') as HTMLButtonElement | null
      expect(parseBtn).not.toBeNull()
      expect(parseBtn!.disabled).toBe(true)
    })

    it('Parse button is enabled when textarea has content', async () => {
      const { wrapper } = mountModal()
      const textarea = document.body.querySelector('[data-testid="paste-textarea"]') as HTMLTextAreaElement | null
      expect(textarea).not.toBeNull()
      textarea!.value = 'some content'
      textarea!.dispatchEvent(new Event('input'))
      await wrapper.vm.$nextTick()
      const parseBtn = document.body.querySelector('[data-testid="parse-btn"]') as HTMLButtonElement | null
      expect(parseBtn!.disabled).toBe(false)
    })

    it('displays parseError when set on store', async () => {
      const { wrapper, store } = mountModal()
      store.parseError = 'Invalid OpenAPI document'
      await wrapper.vm.$nextTick()
      const errorEl = document.body.querySelector('[data-testid="parse-error"]')
      expect(errorEl).not.toBeNull()
      expect(errorEl!.textContent).toContain('Invalid OpenAPI document')
    })
  })

  describe('Step 2: select', () => {
    it('renders checkboxes for each parsed schema', async () => {
      const { wrapper, store } = mountModal()
      store.parsedSchemas = [
        { name: 'User', elements: [] },
        { name: 'Order', description: 'An order', elements: [{ name: 'id', required: true, dataType: { type: 'string' }, generationStrategy: { type: 'random', config: {} }, constraints: {} }] }
      ]
      store.step = 'select'
      await wrapper.vm.$nextTick()
      expect(document.body.querySelector('[data-testid="schema-checkbox-User"]')).not.toBeNull()
      expect(document.body.querySelector('[data-testid="schema-checkbox-Order"]')).not.toBeNull()
    })

    it('Next button is disabled when nothing is selected', async () => {
      const { wrapper, store } = mountModal()
      store.parsedSchemas = [{ name: 'User', elements: [] }]
      store.step = 'select'
      await wrapper.vm.$nextTick()
      // Deselect all by clicking deselect button
      const deselectBtn = [...document.body.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Deselect All'
      )
      if (deselectBtn) {
        deselectBtn.click()
        await wrapper.vm.$nextTick()
      }
      const nextBtn = document.body.querySelector('[data-testid="next-btn"]') as HTMLButtonElement | null
      expect(nextBtn).not.toBeNull()
      expect(nextBtn!.disabled).toBe(true)
    })

    it('renders schema-sync mode text and radio selection', async () => {
      const { wrapper, store } = mountModal()
      store.mode = 'schema-sync'
      store.syncTargetSchemaName = 'CurrentSchema'
      store.parsedSchemas = [
        { name: 'User', elements: [] },
        { name: 'Order', elements: [] }
      ]
      store.step = 'select'
      await wrapper.vm.$nextTick()

      const subtitle = document.body.querySelector('.oai-subtitle')
      expect(subtitle?.textContent).toContain('sync into CurrentSchema')
      expect(document.body.querySelectorAll('input[type="radio"][name="sync-source-schema"]').length).toBe(2)
      expect(document.body.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    })
  })

  describe('Step 3: edit', () => {
    it('renders cards with name inputs and Save All button', async () => {
      const { wrapper, store } = mountModal()
      store.editingSchemas = [
        {
          originalName: 'User',
          name: 'User',
          description: 'A user',
          elements: [],
          action: 'create'
        }
      ]
      store.step = 'edit'
      await wrapper.vm.$nextTick()
      expect(document.body.querySelector('[data-testid="edit-card-User"]')).not.toBeNull()
      expect(document.body.querySelector('[data-testid="save-all-btn"]')).not.toBeNull()
    })

    it('displays per-schema save errors when set', async () => {
      const { wrapper, store } = mountModal()
      store.editingSchemas = [
        {
          originalName: 'User',
          name: 'User',
          description: '',
          elements: [],
          action: 'create'
        }
      ]
      store.saveErrors = { User: 'Network error' }
      store.step = 'edit'
      await wrapper.vm.$nextTick()
      const errorEl = document.body.querySelector('[data-testid="save-error-User"]')
      expect(errorEl).not.toBeNull()
      expect(errorEl!.textContent).toContain('Network error')
    })

    it('Save All button is disabled while saving', async () => {
      const { wrapper, store } = mountModal()
      store.editingSchemas = [
        { originalName: 'User', name: 'User', description: '', elements: [], action: 'create' }
      ]
      store.step = 'edit'
      store.saving = true
      await wrapper.vm.$nextTick()
      const saveBtn = document.body.querySelector('[data-testid="save-all-btn"]') as HTMLButtonElement | null
      expect(saveBtn).not.toBeNull()
      expect(saveBtn!.disabled).toBe(true)
    })

    it('uses sync action label in schema-sync mode', async () => {
      const { wrapper, store } = mountModal()
      store.mode = 'schema-sync'
      store.editingSchemas = [
        { originalName: 'User', name: 'CurrentSchema', description: '', elements: [], action: 'update' }
      ]
      store.step = 'edit'
      await wrapper.vm.$nextTick()

      const saveBtn = document.body.querySelector('[data-testid="save-all-btn"]') as HTMLButtonElement | null
      expect(saveBtn?.textContent).toContain('Sync Schema')
    })
  })
})
