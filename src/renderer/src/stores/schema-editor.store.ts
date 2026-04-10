import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {Schema, SchemaElement, ValidationWarning} from "@shared/models";

export const useSchemaEditorStore = defineStore('schemaEditor', () => {
  const workingSchema = ref<Schema | null>(null)
  const savedSchema = ref<Schema | null>(null)
  const validationWarnings = ref<ValidationWarning[]>([])

  const isDirty = computed(() => {
    if (!workingSchema.value || !savedSchema.value) return false
    return JSON.stringify(workingSchema.value) !== JSON.stringify(savedSchema.value)
  })

  function load(schema: Schema): void {
    savedSchema.value = JSON.parse(JSON.stringify(schema))
    workingSchema.value = JSON.parse(JSON.stringify(schema))
    validationWarnings.value = []
  }

  function markSaved(): void {
    if (workingSchema.value) {
      savedSchema.value = JSON.parse(JSON.stringify(workingSchema.value))
    }
    validationWarnings.value = []
  }

  function setWarnings(warnings: ValidationWarning[]): void {
    validationWarnings.value = warnings
  }

  function reset(): void {
    workingSchema.value = null
    savedSchema.value = null
    validationWarnings.value = []
  }

  function getWarningsForElement(elementPath: string): ValidationWarning[] {
    return validationWarnings.value.filter(
      (w) => w.elementPath === elementPath || w.elementPath.startsWith(elementPath + '.')
    )
  }

  return {
    workingSchema,
    savedSchema,
    validationWarnings,
    isDirty,
    load,
    markSaved,
    setWarnings,
    reset,
    getWarningsForElement
  }
})

export type SchemaEditorStore = ReturnType<typeof useSchemaEditorStore>

// Re-export SchemaElement for convenience in the component
export type { SchemaElement }
