import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { SchemaElement } from '../../../shared/models/schema'
import type { OpenApiParsedSchema } from '../../../main/services/openapi-import.service'
import { useSchemaStore } from './schema.store'

export type WizardStep = 'provide' | 'select' | 'edit'

export interface EditingSchema {
  originalName: string
  name: string
  description: string
  elements: SchemaElement[]
  existingSchemaId?: string
  action: 'create' | 'update'
}

export const useOpenApiImportStore = defineStore('openapi-import', () => {
  const isOpen = ref(false)
  const step = ref<WizardStep>('provide')
  const rawContent = ref<string>('')
  const parsedSchemas = ref<OpenApiParsedSchema[]>([])
  const selectedSchemaNames = ref<string[]>([])
  const editingSchemas = ref<EditingSchema[]>([])
  const parseError = ref<string | null>(null)
  const parsing = ref(false)
  const saving = ref(false)
  const saveErrors = ref<Record<string, string>>({})

  function resetState(): void {
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

    for (const es of editingSchemas.value) {
      try {
        if (es.action === 'create') {
          await api.schemas.create({
            systemId,
            name: es.name,
            description: es.description,
            elements: es.elements
          })
        } else {
          await api.schemas.update(systemId, es.existingSchemaId, {
            name: es.name,
            description: es.description,
            elements: es.elements
          })
        }
      } catch (err: unknown) {
        saveErrors.value[es.originalName] = err instanceof Error ? err.message : 'Save failed.'
      }
    }

    const schemaStore = useSchemaStore()
    await schemaStore.list(systemId)

    if (Object.keys(saveErrors.value).length === 0) {
      close()
    } else {
      saving.value = false
    }
  }

  return {
    isOpen,
    step,
    rawContent,
    parsedSchemas,
    selectedSchemaNames,
    editingSchemas,
    parseError,
    parsing,
    saving,
    saveErrors,
    open,
    close,
    submitContent,
    confirmSelection,
    saveAll
  }
})
