import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface SystemDetails {
  id: string
  name: string
}

export const useSystemStore = defineStore('system', () => {
  const systems = ref<SystemDetails[]>([])
  const selectedSystemId = ref<string | null>(null)
  const loadedSystem = ref<SystemDetails | null>(null)

  async function loadSystems(): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const list: { id: string; name: string }[] = await api.systems.list()
    systems.value = list.map(({ id, name }) => ({ id, name }))
  }

  function selectSystem(id: string, details?: SystemDetails): void {
    selectedSystemId.value = id
    loadedSystem.value = details ?? null
  }

  return { systems, selectedSystemId, loadedSystem, loadSystems, selectSystem }
})
