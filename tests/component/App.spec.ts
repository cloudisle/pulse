import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '@renderer/App.vue'

describe('App component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the app name from the store', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()]
      }
    })
    expect(wrapper.find('h1').text()).toBe('Pulse')
  })

  it('renders the app description', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()]
      }
    })
    expect(wrapper.find('p').text()).toBe('Event Driven Test Application')
  })
})
