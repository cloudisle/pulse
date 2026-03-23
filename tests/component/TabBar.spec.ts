import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TabBar from '@renderer/components/TabBar.vue'
import { useUiStore } from '@renderer/stores/ui.store'

describe('TabBar component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows empty state when no tabs are open', () => {
    const wrapper = mount(TabBar, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.tab-bar__empty').exists()).toBe(true)
    expect(wrapper.findAll('.tab-bar__tab')).toHaveLength(0)
  })

  it('renders tabs when tabs are opened', async () => {
    const pinia = createPinia()
    const wrapper = mount(TabBar, { global: { plugins: [pinia] } })
    const store = useUiStore()
    store.openTab({ id: 'tab1', type: 'system', title: 'System A' })
    store.openTab({ id: 'tab2', type: 'schema', title: 'Schema B' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tab-bar__tab')).toHaveLength(2)
    expect(wrapper.find('.tab-bar__empty').exists()).toBe(false)
  })

  it('marks the active tab', async () => {
    const pinia = createPinia()
    const wrapper = mount(TabBar, { global: { plugins: [pinia] } })
    const store = useUiStore()
    store.openTab({ id: 'tab1', type: 'system', title: 'System A' })
    store.openTab({ id: 'tab2', type: 'schema', title: 'Schema B' })
    store.setActiveTab('tab2')
    await wrapper.vm.$nextTick()
    const tabs = wrapper.findAll('.tab-bar__tab')
    expect(tabs[0].classes()).not.toContain('tab-bar__tab--active')
    expect(tabs[1].classes()).toContain('tab-bar__tab--active')
  })

  it('switches active tab on click', async () => {
    const pinia = createPinia()
    const wrapper = mount(TabBar, { global: { plugins: [pinia] } })
    const store = useUiStore()
    store.openTab({ id: 'tab1', type: 'system', title: 'System A' })
    store.openTab({ id: 'tab2', type: 'schema', title: 'Schema B' })
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.tab-bar__tab')[0].trigger('click')
    expect(store.activeTabId).toBe('tab1')
  })

  it('closes a tab when close button is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mount(TabBar, { global: { plugins: [pinia] } })
    const store = useUiStore()
    store.openTab({ id: 'tab1', type: 'system', title: 'System A' })
    store.openTab({ id: 'tab2', type: 'schema', title: 'Schema B' })
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.tab-bar__close')[0].trigger('click')
    expect(store.openTabs).toHaveLength(1)
    expect(store.openTabs[0].id).toBe('tab2')
  })
})
