import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import Sidebar from '@renderer/components/Sidebar.vue'
import { useUiStore } from '@renderer/stores/ui.store'

describe('Sidebar component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders all navigation sections when expanded', () => {
    const wrapper = mount(Sidebar, { global: { plugins: [createPinia()] } })
    const titles = wrapper.findAll('.sidebar__section-title').map((el) => el.text())
    expect(titles).toEqual(['Systems', 'Schemas', 'Environments', 'Profiles', 'Templates'])
  })

  it('hides navigation when collapsed', async () => {
    const pinia = createPinia()
    const wrapper = mount(Sidebar, { global: { plugins: [pinia] } })
    const store = useUiStore()
    store.toggleSidebar()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar__nav').exists()).toBe(false)
  })

  it('toggles sidebar collapsed state on toggle button click', async () => {
    const pinia = createPinia()
    const wrapper = mount(Sidebar, { global: { plugins: [pinia] } })
    const store = useUiStore()
    expect(store.sidebarCollapsed).toBe(false)
    await wrapper.find('.sidebar__toggle').trigger('click')
    expect(store.sidebarCollapsed).toBe(true)
    await wrapper.find('.sidebar__toggle').trigger('click')
    expect(store.sidebarCollapsed).toBe(false)
  })

  it('applies collapsed class when sidebar is collapsed', async () => {
    const pinia = createPinia()
    const wrapper = mount(Sidebar, { global: { plugins: [pinia] } })
    const store = useUiStore()
    expect(wrapper.find('.sidebar--collapsed').exists()).toBe(false)
    store.toggleSidebar()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar--collapsed').exists()).toBe(true)
  })
})
