import { beforeEach, describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '@renderer/App.vue'

describe('App component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders the app shell', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()]
      }
    })
    expect(wrapper.find('.app-shell').exists()).toBe(true)
  })
})
