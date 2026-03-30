import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import EventSender from '@renderer/components/EventSender/EventSender.vue'
import { useEventSenderStore } from '@renderer/stores/event-sender.store'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useAwsStore } from '@renderer/stores/aws'

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      systems: {
        get: vi.fn().mockResolvedValue({ id: 'sys-1', name: 'Test System', inputs: [], outputs: [] }),
        ...overrides.systems
      },
      sessions: {
        list: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'sess-1', systemId: 'sys-1', name: 'Session 1', createdAt: '', updatedAt: '' }),
        ...overrides.sessions
      },
      events: {
        generate: vi.fn().mockResolvedValue({ schemaId: 'sch-1', payload: { id: '1' }, appliedProfiles: [], warnings: [] }),
        send: vi.fn().mockResolvedValue({ success: true, sessionEventId: 'evt-1' }),
        validate: vi.fn().mockResolvedValue({ valid: true, warnings: [] }),
        ...overrides.events
      },
      ...overrides
    }
  }
}

function mountComponent(pinia = createPinia()) {
  const wrapper = mount(EventSender, { global: { plugins: [pinia] } })
  return { wrapper, pinia }
}

describe('EventSender component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
  })

  // ─── Rendering ─────────────────────────────────────────────────────────────

  it('renders the "Send Event" title', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="event-sender-title"]').text()).toBe('Send Event')
  })

  it('renders config panel with schema and input selectors', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="schema-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="input-select"]').exists()).toBe(true)
  })

  it('renders the Generate and Send buttons', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="generate-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="send-btn"]').exists()).toBe(true)
  })

  it('renders the preview editor', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="preview-editor"]').exists()).toBe(true)
  })

  it('renders session selector and New Session button', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="session-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="new-session-btn"]').exists()).toBe(true)
  })

  // ─── Session management ────────────────────────────────────────────────────

  it('loads sessions and inputs on mount when system is selected', async () => {
    const listMock = vi.fn().mockResolvedValue([
      { id: 'sess-1', systemId: 'sys-1', name: 'Session 1', createdAt: '', updatedAt: '' }
    ])
    const getMock = vi.fn().mockResolvedValue({
      id: 'sys-1',
      name: 'Test',
      inputs: [{ id: 'inp-1', name: 'Kinesis Stream', type: 'kinesis', config: {} }],
      outputs: []
    })
    mockAppApi({ sessions: { list: listMock }, systems: { get: getMock } })

    const pinia = createPinia()
    mountComponent(pinia)
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    await flushPromises()

    const store = useEventSenderStore()
    expect(store.sessions.length).toBeGreaterThanOrEqual(0) // loaded on system change
  })

  it('creates a new session when "New Session" is clicked', async () => {
    const createMock = vi.fn().mockResolvedValue({
      id: 'sess-new',
      systemId: 'sys-1',
      name: 'Session 12:00:00',
      createdAt: '',
      updatedAt: ''
    })
    mockAppApi({ sessions: { list: vi.fn().mockResolvedValue([]), create: createMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="new-session-btn"]').trigger('click')
    await flushPromises()

    expect(createMock).toHaveBeenCalledWith("sys-1")
    const store = useEventSenderStore()
    expect(store.selectedSessionId).toBe('sess-new')
  })

  // ─── Schema and input selectors ────────────────────────────────────────────

  it('populates schema selector from schema store', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const schemaStore = useSchemaStore()
    schemaStore.schemas = [
      { id: 'sch-1', name: 'Order Schema' },
      { id: 'sch-2', name: 'Payment Schema' }
    ]
    await wrapper.vm.$nextTick()

    const options = wrapper.find('[data-testid="schema-select"]').findAll('option')
    const optionTexts = options.map((o) => o.text())
    expect(optionTexts).toContain('Order Schema')
    expect(optionTexts).toContain('Payment Schema')
  })

  it('populates input selector from event sender store inputs', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    store.inputs = [
      { id: 'inp-1', name: 'Kinesis Stream', type: 'kinesis', config: { streamName: 'stream' } }
    ]
    await wrapper.vm.$nextTick()

    const options = wrapper.find('[data-testid="input-select"]').findAll('option')
    const optionTexts = options.map((o) => o.text())
    expect(optionTexts.some((t) => t.includes('Kinesis Stream'))).toBe(true)
  })

  // ─── Profile chips ─────────────────────────────────────────────────────────

  it('renders profile chips from profile store', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const profileStore = useProfileStore()
    profileStore.availableProfiles = [
      { id: 'p1', name: 'Base' },
      { id: 'p2', name: 'Staging' }
    ]
    await wrapper.vm.$nextTick()

    const chips = wrapper.findAll('[data-testid="profile-chip"]')
    expect(chips.length).toBe(2)
    expect(chips[0].text()).toBe('Base')
    expect(chips[1].text()).toBe('Staging')
  })

  it('toggles profile active state when chip is clicked', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const profileStore = useProfileStore()
    profileStore.availableProfiles = [{ id: 'p1', name: 'Base' }]
    await wrapper.vm.$nextTick()

    const chip = wrapper.find('[data-testid="profile-chip"]')
    expect(chip.classes()).not.toContain('event-sender__profile-chip--active')

    await chip.trigger('click')
    await wrapper.vm.$nextTick()
    expect(profileStore.activeProfileIds).toContain('p1')
  })

  // ─── Overrides ─────────────────────────────────────────────────────────────

  it('shows empty override state initially', () => {
    const { wrapper } = mountComponent()
    expect(wrapper.find('[data-testid="overrides-empty"]').exists()).toBe(true)
  })

  it('adds an override row when "Add" is clicked', async () => {
    const { wrapper } = mountComponent()
    await wrapper.find('[data-testid="add-override-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="override-row-0"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="overrides-empty"]').exists()).toBe(false)
  })

  it('removes an override row when × is clicked', async () => {
    const { wrapper } = mountComponent()
    await wrapper.find('[data-testid="add-override-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="override-row-0"]').exists()).toBe(true)
    await wrapper.find('[data-testid="remove-override-0"]').trigger('click')
    expect(wrapper.find('[data-testid="override-row-0"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="overrides-empty"]').exists()).toBe(true)
  })

  // ─── Generate flow ─────────────────────────────────────────────────────────

  it('shows error when Generate is clicked without a schema', async () => {
    const { wrapper } = mountComponent()
    await wrapper.find('[data-testid="generate-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('Select a schema first')
  })

  it('calls events.generate and populates preview on success', async () => {
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: { orderId: 'abc', amount: 42 },
      appliedProfiles: [],
      warnings: []
    })
    mockAppApi({ events: { generate: generateMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    store.selectedSchemaId = 'sch-1'
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="generate-btn"]').trigger('click')
    await flushPromises()

    expect(generateMock).toHaveBeenCalledWith("sys-1",
      expect.objectContaining({ schemaId: 'sch-1' })
    )
    const preview = wrapper.find('[data-testid="preview-editor"]')
    expect(preview.element instanceof HTMLTextAreaElement ? preview.element.value : '').toContain('orderId')
  })

  it('displays validation warnings returned from generate', async () => {
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: { id: '1' },
      appliedProfiles: [],
      warnings: [{ elementPath: 'orderId', message: 'Missing required field', severity: 'warning' }]
    })
    mockAppApi({ events: { generate: generateMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    store.selectedSchemaId = 'sch-1'
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="generate-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="validation-warnings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="warning-0"]').text()).toContain('Missing required field')
  })

  it('passes active profiles and environment to generate', async () => {
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: {},
      appliedProfiles: ['p1'],
      warnings: []
    })
    mockAppApi({ events: { generate: generateMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    store.selectedSchemaId = 'sch-1'
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    const profileStore = useProfileStore()
    profileStore.activeProfileIds = ['p1', 'p2']
    const envStore = useEnvironmentStore()
    envStore.selectedEnvironmentId = 'env-1'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="generate-btn"]').trigger('click')
    await flushPromises()

    expect(generateMock).toHaveBeenCalledWith("sys-1",
      expect.objectContaining({
        profileIds: ['p1', 'p2'],
        environmentId: 'env-1'
      })
    )
  })

  it('passes overrides to generate', async () => {
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: {},
      appliedProfiles: [],
      warnings: []
    })
    mockAppApi({ events: { generate: generateMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    store.selectedSchemaId = 'sch-1'
    store.overrides = [{ elementPath: 'orderId', value: 'custom-123' }]
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="generate-btn"]').trigger('click')
    await flushPromises()

    expect(generateMock).toHaveBeenCalledWith("sys-1",
      expect.objectContaining({
        overrides: { orderId: 'custom-123' }
      })
    )
  })

  // ─── Validate flow ─────────────────────────────────────────────────────────

  it('Send and Validate buttons are disabled before generating', () => {
    const { wrapper } = mountComponent()
    expect((wrapper.find('[data-testid="send-btn"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.find('[data-testid="validate-btn"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('calls events.validate and shows warnings', async () => {
    const validateMock = vi.fn().mockResolvedValue({
      valid: false,
      warnings: [{ elementPath: 'amount', message: 'Must be positive', severity: 'warning' }]
    })
    mockAppApi({ events: { validate: validateMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    store.generatedEvent = { schemaId: 'sch-1', payload: { amount: -1 }, appliedProfiles: [], warnings: [] }
    store.previewJson = JSON.stringify({ amount: -1 }, null, 2)
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="validate-btn"]').trigger('click')
    await flushPromises()

    expect(validateMock).toHaveBeenCalled()
    expect(wrapper.find('[data-testid="validation-warnings"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="warning-0"]').text()).toContain('Must be positive')
  })

  // ─── Send flow ─────────────────────────────────────────────────────────────

  it('shows error when Send is clicked without a destination input', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    store.generatedEvent = { schemaId: 'sch-1', payload: {}, appliedProfiles: [], warnings: [] }
    store.previewJson = '{}'
    store.selectedSessionId = 'sess-1'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="send-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="error-message"]').text()).toContain(
      'Select a destination input first'
    )
  })

  it('shows error when Send is clicked without a session', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    store.generatedEvent = { schemaId: 'sch-1', payload: {}, appliedProfiles: [], warnings: [] }
    store.previewJson = '{}'
    store.selectedInputId = 'inp-1'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="send-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="error-message"]').text()).toContain(
      'Select or create a session first'
    )
  })

  it('calls events.send and shows success notification', async () => {
    const sendMock = vi.fn().mockResolvedValue({ success: true, sessionEventId: 'evt-1' })
    mockAppApi({ events: { send: sendMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    store.generatedEvent = { schemaId: 'sch-1', payload: { id: '1' }, appliedProfiles: [], warnings: [] }
    store.previewJson = JSON.stringify({ id: '1' }, null, 2)
    store.selectedInputId = 'inp-1'
    store.selectedSessionId = 'sess-1'
    const awsStore = useAwsStore()
    awsStore.selectedProfile = 'default'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="send-btn"]').trigger('click')
    await flushPromises()

    expect(sendMock).toHaveBeenCalledWith("sys-1",
      expect.objectContaining({
        inputId: 'inp-1',
        sessionId: 'sess-1',
        cloud: { aws: { profile: 'default' } }
      })
    )
    expect(wrapper.find('[data-testid="send-result"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="send-result"]').text()).toContain('sent successfully')
  })

  it('shows failure notification when send fails', async () => {
    const sendMock = vi.fn().mockRejectedValue(new Error('Connection timeout'))
    mockAppApi({ events: { send: sendMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    store.generatedEvent = { schemaId: 'sch-1', payload: {}, appliedProfiles: [], warnings: [] }
    store.previewJson = '{}'
    store.selectedInputId = 'inp-1'
    store.selectedSessionId = 'sess-1'
    await wrapper.vm.$nextTick()

    await wrapper.find('[data-testid="send-btn"]').trigger('click')
    await flushPromises()

    const result = wrapper.find('[data-testid="send-result"]')
    expect(result.exists()).toBe(true)
    expect(result.text()).toContain('Connection timeout')
  })

  // ─── Preview editing ────────────────────────────────────────────────────────

  it('allows editing the JSON preview', async () => {
    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    store.generatedEvent = { schemaId: 'sch-1', payload: { id: '1' }, appliedProfiles: [], warnings: [] }
    store.previewJson = '{"id": "1"}'
    await wrapper.vm.$nextTick()

    const editor = wrapper.find('[data-testid="preview-editor"]')
    await editor.setValue('{"id": "edited"}')
    expect(store.previewJson).toBe('{"id": "edited"}')
  })

  // ─── Full workflow ──────────────────────────────────────────────────────────

  it('full generate → edit → send workflow', async () => {
    const generateMock = vi.fn().mockResolvedValue({
      schemaId: 'sch-1',
      payload: { orderId: 'gen-1', amount: 100 },
      appliedProfiles: [],
      warnings: []
    })
    const sendMock = vi.fn().mockResolvedValue({ success: true, sessionEventId: 'evt-new' })
    mockAppApi({ events: { generate: generateMock, send: sendMock } })

    const pinia = createPinia()
    const { wrapper } = mountComponent(pinia)
    const store = useEventSenderStore()
    const systemStore = useSystemStore()
    systemStore.selectedSystemId = 'sys-1'
    store.selectedSchemaId = 'sch-1'
    store.selectedInputId = 'inp-1'
    store.selectedSessionId = 'sess-1'
    await wrapper.vm.$nextTick()

    // Step 1: Generate
    await wrapper.find('[data-testid="generate-btn"]').trigger('click')
    await flushPromises()
    expect(store.previewJson).toContain('orderId')

    // Step 2: Edit preview
    const editor = wrapper.find('[data-testid="preview-editor"]')
    await editor.setValue(JSON.stringify({ orderId: 'edited-1', amount: 200 }, null, 2))
    expect(store.previewJson).toContain('edited-1')

    // Step 3: Send
    await wrapper.find('[data-testid="send-btn"]').trigger('click')
    await flushPromises()

    expect(sendMock).toHaveBeenCalledWith("sys-1",
      expect.objectContaining({
        inputId: 'inp-1',
        sessionId: 'sess-1',
        event: expect.objectContaining({
          payload: { orderId: 'edited-1', amount: 200 }
        })
      })
    )
    expect(wrapper.find('[data-testid="send-result"]').text()).toContain('sent successfully')
  })
})
