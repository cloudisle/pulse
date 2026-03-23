import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Environment {
  id: string
  name: string
}

export const useEnvironmentStore = defineStore('environment', () => {
  const selectedEnvironmentId = ref<string | null>(null)
  const environments = ref<Environment[]>([])

  function selectEnvironment(id: string): void {
    selectedEnvironmentId.value = id
  }

  return { selectedEnvironmentId, environments, selectEnvironment }
})
