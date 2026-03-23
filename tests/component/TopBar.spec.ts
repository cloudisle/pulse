import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TopBar from '@renderer/components/TopBar.vue'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useProfileStore } from '@renderer/stores/profile'

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
})

