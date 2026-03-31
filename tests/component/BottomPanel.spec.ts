import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BottomPanel from '@renderer/components/BottomPanel.vue'
import { useUiStore } from '@renderer/stores/ui'

describe('BottomPanel component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the Console header title', () => {
    const wrapper = mount(BottomPanel, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.bottom-panel__title').exists()).toBe(true)
    expect(wrapper.find('.bottom-panel__title').text()).toBe('Console')
  })

  it('shows console content by default', () => {
    const wrapper = mount(BottomPanel, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.bottom-panel__content').exists()).toBe(true)
  })

  it('renders the resize handle and toggle button', async () => {
    const wrapper = mount(BottomPanel, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.bottom-panel__resize-handle').exists()).toBe(true)
    expect(wrapper.find('.bottom-panel__toggle').exists()).toBe(true)
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
