import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Console from '@renderer/components/BottomPanel/Console.vue'
import { useLogStore } from '@renderer/stores/log.store'
import type { LogEntry } from '../../../src/shared/models'

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    level: 'info',
    source: 'test',
    message: 'Test message',
    ...overrides
  }
}

describe('Console component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Reset window.app mock
    ;(window as any).app = undefined
  })

  it('renders empty state when no entries', () => {
    const wrapper = mount(Console, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.console__empty').exists()).toBe(true)
  })

  it('renders log entries from store', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()
    store.addEntry(makeEntry({ level: 'info', message: 'Hello world', source: 'app' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.console__entry').exists()).toBe(true)
    expect(wrapper.find('.console__message').text()).toBe('Hello world')
    expect(wrapper.find('.console__source').text()).toBe('app')
  })

  it('shows correct color class for each log level', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()

    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      store.addEntry(makeEntry({ level, message: `${level} msg` }))
    }
    await wrapper.vm.$nextTick()

    const entries = wrapper.findAll('.console__entry')
    expect(entries.length).toBe(4)
    expect(entries[0].classes()).toContain('console__entry--debug')
    expect(entries[1].classes()).toContain('console__entry--info')
    expect(entries[2].classes()).toContain('console__entry--warn')
    expect(entries[3].classes()).toContain('console__entry--error')
  })

  it('formats timestamp as HH:mm:ss.SSS', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()
    // Use a fixed timestamp: 2024-01-15T14:30:45.123Z (UTC)
    const d = new Date('2024-01-15T14:30:45.123Z')
    const expectedHH = String(d.getHours()).padStart(2, '0')
    const expectedMM = String(d.getMinutes()).padStart(2, '0')
    const expectedSS = String(d.getSeconds()).padStart(2, '0')
    const expected = `${expectedHH}:${expectedMM}:${expectedSS}.123`
    store.addEntry(makeEntry({ timestamp: d.toISOString() }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.console__timestamp').text()).toBe(expected)
  })

  it('filters entries by log level toggles', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()

    store.addEntry(makeEntry({ level: 'debug', message: 'debug msg' }))
    store.addEntry(makeEntry({ level: 'info', message: 'info msg' }))
    store.addEntry(makeEntry({ level: 'warn', message: 'warn msg' }))
    store.addEntry(makeEntry({ level: 'error', message: 'error msg' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.console__entry').length).toBe(4)

    store.filters.debug = false
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.console__entry').length).toBe(3)
    expect(wrapper.findAll('.console__entry--debug').length).toBe(0)

    store.filters.info = false
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.console__entry').length).toBe(2)
  })

  it('filters entries by session', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()

    store.addEntry(makeEntry({ message: 'session A', sessionId: 'session-a' }))
    store.addEntry(makeEntry({ message: 'session B', sessionId: 'session-b' }))
    store.addEntry(makeEntry({ message: 'no session' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.console__entry').length).toBe(3)

    store.sessionFilter = 'session-a'
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.console__entry').length).toBe(1)
    expect(wrapper.find('.console__message').text()).toBe('session A')
  })

  it('clears all entries when clear button is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()

    store.addEntry(makeEntry({ message: 'entry 1' }))
    store.addEntry(makeEntry({ message: 'entry 2' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.console__entry').length).toBe(2)

    await wrapper.find('.console__clear-btn').trigger('click')
    expect(store.entries.length).toBe(0)
    expect(wrapper.findAll('.console__entry').length).toBe(0)
    expect(wrapper.find('.console__empty').exists()).toBe(true)
  })

  it('renders level toggle buttons for debug, info, warn, error', () => {
    const wrapper = mount(Console, { global: { plugins: [createPinia()] } })
    const toggles = wrapper.findAll('.console__level-toggle')
    const texts = toggles.map((t) => t.text())
    expect(texts).toContain('DEBUG')
    expect(texts).toContain('INFO')
    expect(texts).toContain('WARN')
    expect(texts).toContain('ERROR')
  })

  it('toggles level filter when clicking toggle button', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()
    expect(store.filters.debug).toBe(true)

    const debugBtn = wrapper.findAll('.console__level-toggle').find((el) => el.text() === 'DEBUG')
    await debugBtn!.trigger('click')
    expect(store.filters.debug).toBe(false)

    await debugBtn!.trigger('click')
    expect(store.filters.debug).toBe(true)
  })

  it('expands metadata when clicking an entry with metadata', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()

    store.addEntry(makeEntry({ metadata: { key: 'value' } }))
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.console__metadata').exists()).toBe(false)
    await wrapper.find('.console__entry').trigger('click')
    expect(wrapper.find('.console__metadata').exists()).toBe(true)

    await wrapper.find('.console__entry').trigger('click')
    expect(wrapper.find('.console__metadata').exists()).toBe(false)
  })

  it('subscribes to window.app.channels.log.entry.listen on mount', () => {
    const mockListen = vi.fn().mockReturnValue(() => {})
    ;(window as any).app = {
      channels: { log: { entry: { listen: mockListen } } }
    }

    mount(Console, { global: { plugins: [createPinia()] } })
    expect(mockListen).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    const mockListen = vi.fn().mockReturnValue(unsubscribe)
    ;(window as any).app = {
      channels: { log: { entry: { listen: mockListen } } }
    }

    const wrapper = mount(Console, { global: { plugins: [createPinia()] } })
    expect(unsubscribe).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('adds entry to store when log event is received', async () => {
    let capturedListener: ((entry: LogEntry) => void) | null = null
    const mockListen = vi.fn().mockImplementation((cb: (entry: LogEntry) => void) => {
      capturedListener = cb
      return () => {}
    })
    ;(window as any).app = {
      channels: { log: { entry: { listen: mockListen } } }
    }

    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()

    expect(capturedListener).not.toBeNull()
    const entry = makeEntry({ message: 'live entry' })
    capturedListener!(entry)
    await wrapper.vm.$nextTick()

    expect(store.entries.length).toBe(1)
    expect(wrapper.find('.console__message').text()).toBe('live entry')
  })

  it('shows session filter dropdown', () => {
    const wrapper = mount(Console, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.console__session-filter').exists()).toBe(true)
  })

  it('populates session dropdown from entries', async () => {
    const pinia = createPinia()
    const wrapper = mount(Console, { global: { plugins: [pinia] } })
    const store = useLogStore()

    store.addEntry(makeEntry({ sessionId: 'sess-1' }))
    store.addEntry(makeEntry({ sessionId: 'sess-2' }))
    await wrapper.vm.$nextTick()

    const options = wrapper.findAll('.console__session-filter option')
    const values = options.map((o) => o.element.getAttribute('value'))
    expect(values).toContain('sess-1')
    expect(values).toContain('sess-2')
  })
})
