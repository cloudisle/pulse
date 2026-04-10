import {defineStore} from 'pinia'
import {ref, toRaw} from 'vue'
import type {GeneratedEvent, SendEventResult, ValidationWarning} from '@shared/models/event'
import type {InputConfig, System} from '@shared/models/system'
import type {ProfileOverride} from '@shared/models/profile'
import type {Schema, SchemaElement} from '@shared/models/schema'
import {resolveCloudSettings} from "@renderer/util/cloud";

function flattenElementPaths(elements: SchemaElement[], prefix: string): string[] {
  const paths: string[] = []
  for (const el of elements) {
    const path = prefix ? `${prefix}.${el.name}` : el.name
    paths.push(path)
    if (el.children && el.children.length > 0) {
      paths.push(...flattenElementPaths(el.children, path))
    }
  }
  return paths
}

export const useEventSenderStore = defineStore('event-sender', () => {
  const selectedSchemaId = ref<string | null>(null)
  const selectedInputId = ref<string | null>(null)
  const overrides = ref<ProfileOverride[]>([])
  const schemaElements = ref<string[]>([])
  const inputs = ref<InputConfig[]>([])
  const generatedEvent = ref<GeneratedEvent | null>(null)
  const previewJson = ref<string>('')
  const validationWarnings = ref<ValidationWarning[]>([])
  const sendResult = ref<SendEventResult | null>(null)
  const generating = ref(false)
  const sending = ref(false)
  const errorMessage = ref<string>('')

  async function loadInputs(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const system: System = await api.systems.get(systemId)
    inputs.value = system.inputs
  }

  async function loadSchemaElements(systemId: string, schemaId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    try {
      const schema: Schema = await api.schemas.get(systemId, schemaId)
      schemaElements.value = flattenElementPaths(schema.elements ?? [], '')
    } catch {
      schemaElements.value = []
    }
  }

  function addOverride(): void {
    overrides.value.push({ elementPath: '', action: 'set', value: '' })
  }

  function removeOverride(index: number): void {
    overrides.value.splice(index, 1)
  }

  async function generate(systemId: string, profileIds: string[], environmentId: string | null): Promise<void> {
    if (!selectedSchemaId.value) {
      errorMessage.value = 'Select a schema first.'
      return
    }
    const api = (window as any).app?.api
    if (!api) return
    generating.value = true
    errorMessage.value = ''
    sendResult.value = null
    try {
      const event: GeneratedEvent = await api.events.generate(toRaw(systemId), {
        schemaId: selectedSchemaId.value,
        environmentId: toRaw(environmentId) ?? undefined,
        profileIds: toRaw(profileIds),
        adHocOverrides: toRaw(overrides.value)
      })
      generatedEvent.value = event
      previewJson.value = JSON.stringify(event.payload, null, 2)
      validationWarnings.value = event.warnings ?? []
    } catch (err: any) {
      console.error(err)
      errorMessage.value = err?.message ?? 'Failed to generate event.'
    } finally {
      generating.value = false
    }
  }

  async function validate(): Promise<void> {
    if (!generatedEvent.value) {
      errorMessage.value = 'Generate an event first.'
      return
    }
    const api = (window as any).app?.api
    if (!api) return
    try {
      let payload: Record<string, any>
      try {
        payload = JSON.parse(previewJson.value)
      } catch {
        errorMessage.value = 'Invalid JSON in preview.'
        return
      }
      const result = await api.events.validate({
        ...generatedEvent.value,
        payload
      })
      validationWarnings.value = result.warnings ?? []
    } catch (err: any) {
      errorMessage.value = err?.message ?? 'Validation failed.'
    }
  }

  async function send(
    systemId: string,
    sessionId: string | null,
    environmentId: string | null
  ): Promise<void> {
    if (!selectedInputId.value) {
      errorMessage.value = 'Select a destination input first.'
      return
    }
    if (!sessionId) {
      errorMessage.value = 'Select a session first.'
      return
    }
    if (!generatedEvent.value) {
      errorMessage.value = 'Generate an event first.'
      return
    }
    const api = (window as any).app?.api
    if (!api) return
    sending.value = true
    errorMessage.value = ''
    try {
      let payload: Record<string, any>
      try {
        payload = JSON.parse(previewJson.value)
      } catch {
        errorMessage.value = 'Invalid JSON in preview.'
        sending.value = false
        return
      }
      sendResult.value = await api.events.send(toRaw(systemId), {
        inputId: selectedInputId.value,
        sessionId,
        event: {
          schemaId: generatedEvent.value.schemaId,
          payload,
          appliedProfiles: toRaw(generatedEvent.value.appliedProfiles),
          environmentId: toRaw(environmentId),
        },
        cloud: toRaw(resolveCloudSettings()),
        environmentId: toRaw(environmentId) ?? undefined
      })
    } catch (err: any) {
      console.error(err);
      sendResult.value = {
        success: false,
        sessionEventId: '',
        error: err?.message ?? 'Failed to send event.'
      }
    } finally {
      sending.value = false
    }
  }

  function reset(): void {
    selectedSchemaId.value = null
    selectedInputId.value = null
    overrides.value = []
    schemaElements.value = []
    inputs.value = []
    generatedEvent.value = null
    previewJson.value = ''
    validationWarnings.value = []
    sendResult.value = null
    generating.value = false
    sending.value = false
    errorMessage.value = ''
  }

  return {
    selectedSchemaId,
    selectedInputId,
    overrides,
    schemaElements,
    inputs,
    generatedEvent,
    previewJson,
    validationWarnings,
    sendResult,
    generating,
    sending,
    errorMessage,
    loadInputs,
    loadSchemaElements,
    addOverride,
    removeOverride,
    generate,
    validate,
    send,
    reset
  }
})
