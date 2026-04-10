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

  async function deleteSchema(systemId: string, id: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    await api.schemas.delete(systemId, id)
    schemas.value = schemas.value.filter((s) => s.id !== id)
  }

  function reset(): void {
    schemas.value = []
  }

  return { schemas, list, deleteSchema, reset }
})
