import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TopBar from '@renderer/components/TopBar.vue'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useProfileStore } from '@renderer/stores/profile'
import { useUiStore } from '@renderer/stores/ui'

describe('TopBar component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders environment and profiles controls in the right section', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()
    const profileStore = useProfileStore()

    environmentStore.environments = [{ id: 'env-dev', name: 'Development' }]
    profileStore.setProfiles([{ id: 'profile-1', name: 'Default' }])
    await wrapper.vm.$nextTick()

    const rightSection = wrapper.find('.top-bar__right')
    expect(rightSection.exists()).toBe(true)
    expect(rightSection.find('#environment-select').exists()).toBe(true)

    const labels = rightSection.findAll('.top-bar__label').map((el) => el.text())
    expect(labels).toEqual(['Environment', 'Profiles'])
  })

  it('updates selected environment on dropdown change', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()

    environmentStore.environments = [
      { id: 'env-dev', name: 'Development' },
      { id: 'env-prod', name: 'Production' }
    ]
    await wrapper.vm.$nextTick()

    await wrapper.find('#environment-select').setValue('env-prod')
    expect(environmentStore.selectedEnvironmentId).toBe('env-prod')
  })

  it('shows (none) option to clear the environment selection', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()

    environmentStore.environments = [{ id: 'env-dev', name: 'Development' }]
    environmentStore.selectEnvironment('env-dev')
    await wrapper.vm.$nextTick()

    expect(environmentStore.selectedEnvironmentId).toBe('env-dev')

    await wrapper.find('#environment-select').setValue('')
    expect(environmentStore.selectedEnvironmentId).toBeNull()
  })

  it('shows the (none) option as the first option in the environment dropdown', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const environmentStore = useEnvironmentStore()

    environmentStore.environments = [{ id: 'env-dev', name: 'Development' }]
    await wrapper.vm.$nextTick()

    const options = wrapper.find('#environment-select').findAll('option')
    expect(options[0].element.value).toBe('')
    expect(options[0].text()).toBe('(none)')
  })

  it('renders profile chips and shows order number on active profiles', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const profileStore = useProfileStore()

    profileStore.setProfiles([
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' }
    ])
    profileStore.toggleProfile('p2')
    profileStore.toggleProfile('p1')
    await wrapper.vm.$nextTick()

    const chips = wrapper.findAll('.top-bar__profile-chip')
    expect(chips).toHaveLength(2)

    // p2 was selected first so it is #1, p1 is #2
    const p2Chip = chips.find((c) => c.text().includes('Beta'))!
    const p1Chip = chips.find((c) => c.text().includes('Alpha'))!
    expect(p2Chip.find('.top-bar__profile-order').text()).toBe('1')
    expect(p1Chip.find('.top-bar__profile-order').text()).toBe('2')
  })

  it('shows empty state with create link when no profiles exist', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    await wrapper.vm.$nextTick()

    const empty = wrapper.find('.top-bar__profile-empty')
    expect(empty.exists()).toBe(true)
    expect(empty.text()).toContain('No profiles')
    expect(empty.find('.top-bar__profile-create-link').exists()).toBe(true)
  })

  it('opens profile editor tab when create link is clicked', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const uiStore = useUiStore()
    await wrapper.vm.$nextTick()

    await wrapper.find('.top-bar__profile-create-link').trigger('click')
    expect(uiStore.openTabs.some((t) => t.type === 'profile')).toBe(true)
  })

  it('toggles profile active state on chip click', async () => {
    const pinia = createPinia()
    const wrapper = mount(TopBar, { global: { plugins: [pinia] } })
    const profileStore = useProfileStore()

    profileStore.setProfiles([{ id: 'p1', name: 'Alpha' }])
    await wrapper.vm.$nextTick()

    expect(profileStore.activeProfileIds).toHaveLength(0)
    await wrapper.find('.top-bar__profile-chip').trigger('click')
    expect(profileStore.activeProfileIds).toContain('p1')
    await wrapper.find('.top-bar__profile-chip').trigger('click')
    expect(profileStore.activeProfileIds).not.toContain('p1')
  })
})
