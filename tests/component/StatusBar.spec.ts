import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StatusBar from '@renderer/components/StatusBar.vue'
import { useAwsStore } from '@renderer/stores/aws'

describe('StatusBar component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders AWS profile dropdown', () => {
    const wrapper = mount(StatusBar, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('#aws-profile-select').exists()).toBe(true)
    expect(wrapper.find('.status-bar__label').text()).toContain('AWS Profile')
  })

  it('populates AWS profile dropdown from store', async () => {
    const pinia = createPinia()
    const wrapper = mount(StatusBar, { global: { plugins: [pinia] } })
    const awsStore = useAwsStore()

    awsStore.setProfiles(['default', 'staging', 'production'])
    await wrapper.vm.$nextTick()

    const options = wrapper.find('#aws-profile-select').findAll('option')
    const profileOptions = options.filter((o) => o.element.value !== '')
    expect(profileOptions.map((o) => o.element.value)).toEqual(['default', 'staging', 'production'])
  })

  it('updates selected profile in store on dropdown change', async () => {
    const pinia = createPinia()
    const wrapper = mount(StatusBar, { global: { plugins: [pinia] } })
    const awsStore = useAwsStore()

    awsStore.setProfiles(['default', 'staging'])
    await wrapper.vm.$nextTick()

    await wrapper.find('#aws-profile-select').setValue('staging')
    expect(awsStore.selectedProfile).toBe('staging')
  })

  it('calls loadProfiles on mount', async () => {
    const pinia = createPinia()
    const awsStore = useAwsStore(pinia)
    const loadSpy = vi.spyOn(awsStore, 'loadProfiles').mockResolvedValue()

    mount(StatusBar, { global: { plugins: [pinia] } })
    await new Promise((r) => setTimeout(r, 0))

    expect(loadSpy).toHaveBeenCalledOnce()
  })

  it('renders the validate button', () => {
    const wrapper = mount(StatusBar, { global: { plugins: [createPinia()] } })
    expect(wrapper.find('.status-bar__validate-btn').exists()).toBe(true)
  })

  it('disables validate button when no profile is selected', async () => {
    const pinia = createPinia()
    const wrapper = mount(StatusBar, { global: { plugins: [pinia] } })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.status-bar__validate-btn').attributes('disabled')).toBeDefined()
  })

  it('enables validate button when a profile is selected', async () => {
    const pinia = createPinia()
    const wrapper = mount(StatusBar, { global: { plugins: [pinia] } })
    const awsStore = useAwsStore()

    awsStore.setProfiles(['default'])
    awsStore.selectProfile('default')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.status-bar__validate-btn').attributes('disabled')).toBeUndefined()
  })

  it('shows success indicator after successful validation', async () => {
    const pinia = createPinia()
    const wrapper = mount(StatusBar, { global: { plugins: [pinia] } })
    const awsStore = useAwsStore()

    awsStore.setProfiles(['default'])
    awsStore.selectProfile('default')
    awsStore.validationResult = { valid: true, identity: { account: '123456789', arn: 'arn:aws:iam::123456789:user/test' } }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.status-bar__validate-icon--success').exists()).toBe(true)
  })

  it('shows failure indicator after failed validation', async () => {
    const pinia = createPinia()
    const wrapper = mount(StatusBar, { global: { plugins: [pinia] } })
    const awsStore = useAwsStore()

    awsStore.setProfiles(['default'])
    awsStore.selectProfile('default')
    awsStore.validationResult = { valid: false, error: 'Invalid credentials' }
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.status-bar__validate-icon--failure').exists()).toBe(true)
  })

  it('calls validateCredentials on validate button click', async () => {
    const pinia = createPinia()
    const wrapper = mount(StatusBar, { global: { plugins: [pinia] } })
    const awsStore = useAwsStore()

    awsStore.setProfiles(['default'])
    awsStore.selectProfile('default')
    const validateSpy = vi.spyOn(awsStore, 'validateCredentials').mockResolvedValue()
    await wrapper.vm.$nextTick()

    await wrapper.find('.status-bar__validate-btn').trigger('click')
    expect(validateSpy).toHaveBeenCalledWith('default')
  })
})
