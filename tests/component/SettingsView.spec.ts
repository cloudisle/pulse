import { beforeEach, describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import SettingsView from '@renderer/components/Settings/SettingsView.vue'

const DEFAULT_SETTINGS = {
  sessionHistoryLimit: 10,
  defaultRegion: 'us-east-1',
  theme: 'dark' as const,
  logLevel: 'info' as const,
  dataDirectory: '/home/user/.config/pulse/data'
}

function mockAppApi(overrides: Record<string, any> = {}) {
  ;(window as any).app = {
    api: {
      app: {
        getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
        updateSettings: vi.fn().mockImplementation((partial: any) =>
          Promise.resolve({ ...DEFAULT_SETTINGS, ...partial })
        ),
        selectDirectory: vi.fn().mockResolvedValue('/new/data/dir'),
        ...(overrides.app ?? {})
      }
    }
  }
}

function mountComponent(pinia = createPinia()) {
  return mount(SettingsView, { global: { plugins: [pinia] } })
}

describe('SettingsView component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAppApi()
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders the settings form fields', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.find('[data-testid="session-history-limit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="default-region"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="theme"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="data-directory"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="log-level"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reset-btn"]').exists()).toBe(true)
  })

  it('loads and displays current settings on mount', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect((wrapper.find('[data-testid="session-history-limit"]').element as HTMLInputElement).value).toBe('10')
    expect((wrapper.find('[data-testid="default-region"]').element as HTMLInputElement).value).toBe('us-east-1')
    expect((wrapper.find('[data-testid="theme"]').element as HTMLSelectElement).value).toBe('dark')
    expect((wrapper.find('[data-testid="data-directory"]').element as HTMLInputElement).value).toBe('/home/user/.config/pulse/data')
    expect((wrapper.find('[data-testid="log-level"]').element as HTMLSelectElement).value).toBe('info')
  })

  it('allows editing sessionHistoryLimit', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const input = wrapper.find('[data-testid="session-history-limit"]')
    await input.setValue('25')
    expect((input.element as HTMLInputElement).value).toBe('25')
  })

  it('allows editing defaultRegion', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const input = wrapper.find('[data-testid="default-region"]')
    await input.setValue('eu-west-1')
    expect((input.element as HTMLInputElement).value).toBe('eu-west-1')
  })

  it('allows selecting a different theme', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const select = wrapper.find('[data-testid="theme"]')
    await select.setValue('light')
    expect((select.element as HTMLSelectElement).value).toBe('light')
  })

  it('applies data-theme attribute on the html element when theme changes', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    await wrapper.find('[data-testid="theme"]').setValue('light')
    await wrapper.vm.$nextTick()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    await wrapper.find('[data-testid="theme"]').setValue('system')
    await wrapper.vm.$nextTick()
    expect(document.documentElement.getAttribute('data-theme')).toBe('system')
  })

  it('calls updateSettings with current values when save is clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('[data-testid="default-region"]').setValue('ap-southeast-1')
    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    await flushPromises()

    expect((window as any).app.api.app.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultRegion: 'ap-southeast-1' })
    )
  })

  it('shows a success message after saving', async () => {
    vi.useFakeTimers()
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="save-success"]').exists()).toBe(true)
    vi.useRealTimers()
  })

  it('shows an error message when save fails', async () => {
    mockAppApi({ app: { updateSettings: vi.fn().mockRejectedValue(new Error('disk full')) } })
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('[data-testid="save-btn"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="save-error"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="save-error"]').text()).toContain('disk full')
  })

  it('resets fields to defaults when reset button is clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('[data-testid="default-region"]').setValue('eu-central-1')
    await wrapper.find('[data-testid="session-history-limit"]').setValue('50')
    await wrapper.find('[data-testid="theme"]').setValue('light')
    await wrapper.find('[data-testid="log-level"]').setValue('debug')

    await wrapper.find('[data-testid="reset-btn"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect((wrapper.find('[data-testid="default-region"]').element as HTMLInputElement).value).toBe('us-east-1')
    expect((wrapper.find('[data-testid="session-history-limit"]').element as HTMLInputElement).value).toBe('10')
    expect((wrapper.find('[data-testid="theme"]').element as HTMLSelectElement).value).toBe('dark')
    expect((wrapper.find('[data-testid="log-level"]').element as HTMLSelectElement).value).toBe('info')
  })

  it('opens a directory picker when Change button is clicked and updates data directory', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('[data-testid="change-directory"]').trigger('click')
    await flushPromises()

    expect((window as any).app.api.app.selectDirectory).toHaveBeenCalled()
    expect((wrapper.find('[data-testid="data-directory"]').element as HTMLInputElement).value).toBe('/new/data/dir')
  })

  it('does not update data directory when directory picker is cancelled', async () => {
    mockAppApi({ app: { selectDirectory: vi.fn().mockResolvedValue(null) } })
    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('[data-testid="change-directory"]').trigger('click')
    await flushPromises()

    expect((wrapper.find('[data-testid="data-directory"]').element as HTMLInputElement).value).toBe('/home/user/.config/pulse/data')
  })
})
