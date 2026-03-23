import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BottomPanel from '@renderer/components/BottomPanel.vue'
import { useUiStore } from '@renderer/stores/ui.store'

describe('BottomPanel component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders Console and Listeners sub-tabs', () => {
    const wrapper = mount(BottomPanel, { global: { plugins: [createPinia()] } })
    const tabs = wrapper.findAll('.bottom-panel__tab').map((el) => el.text())
    expect(tabs).toContain('Console')
    expect(tabs).toContain('Listeners')
  })

  it('shows console content by default', () => {
    const wrapper = mount(BottomPanel, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.bottom-panel__console').exists()).toBe(true)
    expect(wrapper.find('.bottom-panel__listeners').exists()).toBe(false)
  })

  it('switches to listeners sub-tab on click', async () => {
    const wrapper = mount(BottomPanel, { global: { plugins: [createPinia()] } })
    const listenersTab = wrapper.findAll('.bottom-panel__tab').find((el) => el.text() === 'Listeners')
    await listenersTab!.trigger('click')
    expect(wrapper.find('.bottom-panel__listeners').exists()).toBe(true)
    expect(wrapper.find('.bottom-panel__console').exists()).toBe(false)
  })

  it('collapses and expands via toggle button', async () => {
    const pinia = createPinia()
    const wrapper = mount(BottomPanel, { global: { plugins: [pinia] } })
    const store = useUiStore()
    expect(store.bottomPanelCollapsed).toBe(false)
    await wrapper.find('.bottom-panel__toggle').trigger('click')
    expect(store.bottomPanelCollapsed).toBe(true)
    expect(wrapper.find('.bottom-panel__content').exists()).toBe(false)
    await wrapper.find('.bottom-panel__toggle').trigger('click')
    expect(store.bottomPanelCollapsed).toBe(false)
    expect(wrapper.find('.bottom-panel__content').exists()).toBe(true)
  })

  it('applies collapsed class when bottom panel is collapsed', async () => {
    const pinia = createPinia()
    const wrapper = mount(BottomPanel, { global: { plugins: [pinia] } })
    const store = useUiStore()
    expect(wrapper.find('.bottom-panel--collapsed').exists()).toBe(false)
    store.toggleBottomPanel()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.bottom-panel--collapsed').exists()).toBe(true)
  })
})
