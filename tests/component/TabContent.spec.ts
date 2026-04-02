import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, ref } from 'vue'
import TabContent from '@renderer/components/TabContent.vue'
import { useUiStore } from '@renderer/stores/ui'

const EnvironmentEditorStub = defineComponent({
  name: 'EnvironmentEditor',
  props: {
    environmentId: {
      type: String,
      required: false
    }
  },
  setup(props) {
    const draft = ref(`draft-${props.environmentId ?? 'new'}`)
    return { draft }
  },
  template: `
    <div>
      <div data-testid="env-id">{{ environmentId }}</div>
      <input data-testid="env-draft" v-model="draft" />
    </div>
  `
})

describe('TabContent component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('keeps same-type tabs isolated by tab id', async () => {
    const pinia = createPinia()
    const uiStore = useUiStore(pinia)

    uiStore.openTab({ id: 'environment:env-1', type: 'environment', title: 'Env 1' })
    uiStore.openTab({ id: 'environment:env-2', type: 'environment', title: 'Env 2' })

    const wrapper = mount(TabContent, {
      global: {
        plugins: [pinia],
        stubs: {
          EnvironmentEditor: EnvironmentEditorStub
        }
      }
    })

    uiStore.setActiveTab('environment:env-1')
    await wrapper.vm.$nextTick()

    let draftInput = wrapper.find('[data-testid="env-draft"]')
    expect((draftInput.element as HTMLInputElement).value).toBe('draft-env-1')

    await draftInput.setValue('custom-one')

    uiStore.setActiveTab('environment:env-2')
    await wrapper.vm.$nextTick()

    draftInput = wrapper.find('[data-testid="env-draft"]')
    expect((draftInput.element as HTMLInputElement).value).toBe('draft-env-2')

    await draftInput.setValue('custom-two')

    uiStore.setActiveTab('environment:env-1')
    await wrapper.vm.$nextTick()

    draftInput = wrapper.find('[data-testid="env-draft"]')
    expect((draftInput.element as HTMLInputElement).value).toBe('custom-one')
  })
})

