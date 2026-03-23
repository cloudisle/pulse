import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface SchemaItem {
  id: string
  name: string
}

export const useSchemaStore = defineStore('schema', () => {
  const schemas = ref<SchemaItem[]>([])

  async function list(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const items: { id: string; name: string }[] = await api.schemas.list(systemId)
    schemas.value = items.map(({ id, name }) => ({ id, name }))
  }

  function reset(): void {
    schemas.value = []
  }

  return { schemas, list, reset }
})
