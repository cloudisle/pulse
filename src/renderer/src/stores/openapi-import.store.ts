import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SchemaElement } from '@shared/models/schema'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { OpenApiParsedSchema } from '@shared/models/openapi'

export type WizardStep = 'provide' | 'select' | 'edit'
export type OpenApiImportMode = 'bulk-import' | 'schema-sync'

export interface EditingSchema {
  originalName: string
  name: string
  description: string
  elements: SchemaElement[]
  existingSchemaId?: string
  action: 'create' | 'update'
}

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export const useOpenApiImportStore = defineStore('openapi-import', () => {
  const isOpen = ref(false)
  const mode = ref<OpenApiImportMode>('bulk-import')
  const syncTargetSchemaId = ref<string | null>(null)
  const syncTargetSchemaName = ref('')
  const step = ref<WizardStep>('provide')
  const rawContent = ref<string>('')
  const parsedSchemas = ref<OpenApiParsedSchema[]>([])
  const selectedSchemaNames = ref<string[]>([])
  const editingSchemas = ref<EditingSchema[]>([])
  const parseError = ref<string | null>(null)
  const parsing = ref(false)
  const saving = ref(false)
  const saveErrors = ref<Record<string, string>>({})
  const lastSavedSchemaIds = ref<string[]>([])
  const lastSaveCompletedAt = ref(0)

  function resetState(): void {
    mode.value = 'bulk-import'
    syncTargetSchemaId.value = null
    syncTargetSchemaName.value = ''
    step.value = 'provide'
    rawContent.value = ''
    parsedSchemas.value = []
    selectedSchemaNames.value = []
    editingSchemas.value = []
    parseError.value = null
    parsing.value = false
    saving.value = false
    saveErrors.value = {}
  }

  function open(): void {
    resetState()
    isOpen.value = true
  }

  function openForSchemaSync(schemaId: string, schemaName: string): void {
    resetState()
    mode.value = 'schema-sync'
    syncTargetSchemaId.value = schemaId
    syncTargetSchemaName.value = schemaName
    isOpen.value = true
  }

  function close(): void {
    resetState()
    isOpen.value = false
  }

  async function submitContent(content: string): Promise<void> {
    rawContent.value = content
    parsing.value = true
    parseError.value = null
    try {
      const result = await (window as any).app?.api?.openapiImport?.parseFile(content)
      if (!result || result.error) {
        parseError.value = result?.error ?? 'Failed to parse OpenAPI content.'
        return
      }
      parsedSchemas.value = result.schemas
      step.value = 'select'
    } catch (err: unknown) {
      parseError.value = err instanceof Error ? err.message : 'Failed to parse OpenAPI content.'
    } finally {
      parsing.value = false
    }
  }

  function confirmSelection(names: string[]): void {
    selectedSchemaNames.value = names
    const schemaStore = useSchemaStore()

    if (mode.value === 'schema-sync') {
      const selectedName = names[0]
      if (!selectedName) {
        editingSchemas.value = []
        return
      }

      const parsed = parsedSchemas.value.find((s) => s.name === selectedName)
      if (!parsed) {
        editingSchemas.value = []
        return
      }

      const fallbackExisting = schemaStore.schemas.find(
        (s) => s.name.toLowerCase() === syncTargetSchemaName.value.toLowerCase()
      )
      const existingSchemaId = syncTargetSchemaId.value ?? fallbackExisting?.id

      if (!existingSchemaId) {
        parseError.value = `Could not find target schema "${syncTargetSchemaName.value}" for sync.`
        return
      }

      editingSchemas.value = [{
        originalName: selectedName,
        name: syncTargetSchemaName.value || parsed.name,
        description: parsed.description ?? '',
        elements: JSON.parse(JSON.stringify(parsed.elements)) as SchemaElement[],
        existingSchemaId,
        action: 'update'
      }]

      step.value = 'edit'
      return
    }

    editingSchemas.value = names.map((name) => {
      const parsed = parsedSchemas.value.find((s) => s.name === name)!
      const existing = schemaStore.schemas.find(
        (s) => s.name.toLowerCase() === name.toLowerCase()
      )
      return {
        originalName: name,
        name: parsed.name,
        description: parsed.description ?? '',
        elements: JSON.parse(JSON.stringify(parsed.elements)) as SchemaElement[],
        existingSchemaId: existing?.id,
        action: existing ? 'update' : 'create'
      } satisfies EditingSchema
    })

    step.value = 'edit'
  }

  async function saveAll(systemId: string): Promise<void> {
    saving.value = true
    saveErrors.value = {}
    const api = (window as any).app?.api
    const savedSchemaIds: string[] = []

    for (const es of editingSchemas.value) {
      try {
        const payload = {
          name: es.name,
          description: es.description,
          elements: toPlain(es.elements)
        }

        if (es.action === 'create') {
          const created = await api.schemas.create({
            systemId,
            ...payload
          })
          if (created?.id) {
            savedSchemaIds.push(created.id)
          }
        } else {
          await api.schemas.update(systemId, es.existingSchemaId, payload)
          if (es.existingSchemaId) {
            savedSchemaIds.push(es.existingSchemaId)
          }
        }
      } catch (err: unknown) {
        saveErrors.value[es.originalName] = err instanceof Error ? err.message : 'Save failed.'
      }
    }

    const schemaStore = useSchemaStore()
    await schemaStore.list(systemId)

    if (Object.keys(saveErrors.value).length === 0) {
      lastSavedSchemaIds.value = savedSchemaIds
      lastSaveCompletedAt.value = Date.now()
      close()
    } else {
      saving.value = false
    }
  }

  return {
    isOpen,
    mode,
    syncTargetSchemaId,
    syncTargetSchemaName,
    step,
    rawContent,
    parsedSchemas,
    selectedSchemaNames,
    editingSchemas,
    parseError,
    parsing,
    saving,
    saveErrors,
    lastSavedSchemaIds,
    lastSaveCompletedAt,
    open,
    openForSchemaSync,
    close,
    submitContent,
    confirmSelection,
    saveAll
  }
})
