import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface SystemDetails {
  id: string
  name: string
}

export const useSystemStore = defineStore('system', () => {
  const selectedSystemId = ref<string | null>(null)
  const loadedSystem = ref<SystemDetails | null>(null)

  function selectSystem(id: string, details?: SystemDetails): void {
    selectedSystemId.value = id
    loadedSystem.value = details ?? null
  }

  return { selectedSystemId, loadedSystem, selectSystem }
})
