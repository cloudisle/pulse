import {defineStore} from 'pinia'
import {ref, toRaw} from 'vue'
import type {GeneratedEvent, SendEventResult, ValidationWarning} from '../../../shared/models/event'
import type {Session} from '../../../shared/models/session'
import type {InputConfig, System} from '../../../shared/models/system'

export interface Override {
  elementPath: string
  value: string
}

export const useEventSenderStore = defineStore('event-sender', () => {
  const selectedSchemaId = ref<string | null>(null)
  const selectedInputId = ref<string | null>(null)
  const overrides = ref<Override[]>([])
  const selectedSessionId = ref<string | null>(null)
  const sessions = ref<Session[]>([])
  const inputs = ref<InputConfig[]>([])
  const generatedEvent = ref<GeneratedEvent | null>(null)
  const previewJson = ref<string>('')
  const validationWarnings = ref<ValidationWarning[]>([])
  const sendResult = ref<SendEventResult | null>(null)
  const generating = ref(false)
  const sending = ref(false)
  const errorMessage = ref<string>('')

  async function loadSessions(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const items: Session[] = await api.sessions.list(systemId)
    sessions.value = items
  }

  async function loadInputs(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const system: System = await api.systems.get(systemId)
    inputs.value = system.inputs
  }

  async function createSession(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const session: Session = await api.sessions.create(systemId);
    sessions.value.unshift(session)
    selectedSessionId.value = session.id
  }

  function addOverride(): void {
    overrides.value.push({ elementPath: '', value: '' })
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
      const overridesMap: Record<string, any> = {}
      for (const o of overrides.value) {
        if (o.elementPath) overridesMap[o.elementPath] = o.value
      }
      const event: GeneratedEvent = await api.events.generate(toRaw(systemId), {
        schemaId: selectedSchemaId.value,
        environmentId: toRaw(environmentId) ?? undefined,
        profileIds: toRaw(profileIds),
        overrides: overridesMap
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

  async function send(systemId: string, awsProfile: string, environmentId: string | null): Promise<void> {
    if (!selectedInputId.value) {
      errorMessage.value = 'Select a destination input first.'
      return
    }
    if (!selectedSessionId.value) {
      errorMessage.value = 'Select or create a session first.'
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
        sessionId: selectedSessionId.value,
        event: {
          schemaId: generatedEvent.value.schemaId,
          payload,
          appliedProfiles: toRaw(generatedEvent.value.appliedProfiles),
          environmentId: toRaw(environmentId),
        },
        awsProfile: toRaw(awsProfile),
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
    selectedSessionId.value = null
    sessions.value = []
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
    selectedSessionId,
    sessions,
    inputs,
    generatedEvent,
    previewJson,
    validationWarnings,
    sendResult,
    generating,
    sending,
    errorMessage,
    loadSessions,
    loadInputs,
    createSession,
    addOverride,
    removeOverride,
    generate,
    validate,
    send,
    reset
  }
})
