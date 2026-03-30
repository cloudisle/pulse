import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Environment {
  id: string
  name: string
}

export const useEnvironmentStore = defineStore('environment', () => {
  const selectedEnvironmentId = ref<string | null>(null)
  const environments = ref<Environment[]>([])

  async function list(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const items: { id: string; name: string }[] = await api.environments.list(systemId)
    environments.value = items.map(({ id, name }) => ({ id, name }))
  }

  function selectEnvironment(id: string | null): void {
    selectedEnvironmentId.value = id
  }

  return { selectedEnvironmentId, environments, list, selectEnvironment }
})
