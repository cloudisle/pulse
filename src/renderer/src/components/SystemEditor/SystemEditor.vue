<script setup lang="ts">
import {ref, reactive, onMounted, computed, toRaw} from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import type { InputType, OutputType } from '@shared/models/system'
import type { ListenerFilterMode } from '@shared/models/listener'

const props = defineProps<{
  systemId?: string
}>()

const uiStore = useUiStore()
const systemStore = useSystemStore()

const isEditMode = computed(() => !!props.systemId && props.systemId !== 'new')

const name = ref('')
const description = ref('')

interface InputRow {
  id?: string
  name: string
  type: InputType
  config: Record<string, string>
}

interface OutputRow {
  id?: string
  name: string
  type: OutputType
  config: Record<string, string>
  contentType: 'string' | 'json'
  listenerDefaults: {
    sentPath: string
    receivedPath: string
    filterMode: ListenerFilterMode
    includeHistoricalSent: boolean
  }
}

const inputs = reactive<InputRow[]>([])
const outputs = reactive<OutputRow[]>([])

const errorMessage = ref('')
const saving = ref(false)
const deleting = ref(false)

const INPUT_TYPES: InputType[] = ['kinesis', 'sqs', 'eventbridge']
const OUTPUT_TYPES: OutputType[] = ['kinesis', 'sqs']

const INPUT_CONFIG_FIELDS: Record<InputType, string[]> = {
  kinesis: ['streamName', 'region', 'partitionKey'],
  sqs: ['queueUrl', 'region'],
  eventbridge: ['eventBusName', 'region', 'source', 'detailType']
}

const OUTPUT_CONFIG_FIELDS: Record<OutputType, string[]> = {
  kinesis: ['streamName', 'region', 'partitionKey'],
  sqs: ['queueUrl', 'region']
}

function defaultInputConfig(type: InputType): Record<string, string> {
  return Object.fromEntries(INPUT_CONFIG_FIELDS[type].map((f) => [f, '']))
}

function defaultOutputConfig(type: OutputType): Record<string, string> {
  return Object.fromEntries(OUTPUT_CONFIG_FIELDS[type].map((f) => [f, '']))
}

function onInputTypeChange(row: InputRow, newType: InputType): void {
  row.type = newType
  row.config = defaultInputConfig(newType)
}

function onOutputTypeChange(row: OutputRow, newType: OutputType): void {
  row.type = newType
  row.config = defaultOutputConfig(newType)
}

function addInput(): void {
  const type: InputType = 'kinesis'
  inputs.push({ name: '', type, config: defaultInputConfig(type) })
}

function removeInput(index: number): void {
  inputs.splice(index, 1)
}

function addOutput(): void {
  const type: OutputType = 'kinesis'
  outputs.push({
    name: '',
    type,
    config: defaultOutputConfig(type),
    contentType: 'json',
    listenerDefaults: {
      sentPath: '$.id',
      receivedPath: '$.eventId',
      filterMode: 'all',
      includeHistoricalSent: true,
    }
  })
}

function removeOutput(index: number): void {
  outputs.splice(index, 1)
}

onMounted(async () => {
  if (!isEditMode.value) return
  const api = (window as any).app?.api
  if (!api) return
  try {
    const system = await api.systems.get(props.systemId)
    name.value = system.name ?? ''
    description.value = system.description ?? ''
    inputs.push(
      ...system.inputs.map((inp: any) => ({
        id: inp.id,
        name: inp.name,
        type: inp.type as InputType,
        config: Object.fromEntries(
          INPUT_CONFIG_FIELDS[inp.type as InputType].map((f: string) => [f, inp.config[f] ?? ''])
        )
      }))
    )
    outputs.push(
      ...system.outputs.map((out: any) => ({
        id: out.id,
        name: out.name,
        type: out.type as OutputType,
        config: Object.fromEntries(
          OUTPUT_CONFIG_FIELDS[out.type as OutputType].map((f: string) => [f, out.config[f] ?? ''])
        ),
        contentType: out.contentType ?? 'json',
        listenerDefaults: {
          sentPath: out.listenerDefaults?.filters?.find((f: any) => f.type === 'sessionCorrelation')?.config?.sentPath ?? '$.id',
          receivedPath: out.listenerDefaults?.filters?.find((f: any) => f.type === 'sessionCorrelation')?.config?.receivedPath ?? '$.eventId',
          filterMode: out.listenerDefaults?.filterMode ?? 'all',
          includeHistoricalSent:
            out.listenerDefaults?.filters?.find((f: any) => f.type === 'sessionCorrelation')?.config?.includeHistoricalSent !== false,
        }
      }))
    )
  } catch {
    errorMessage.value = 'Failed to load system.'
  }
})

async function save(): Promise<void> {
  if (!name.value.trim()) {
    errorMessage.value = 'System name is required.'
    return
  }
  errorMessage.value = ''
  saving.value = true
  const api = (window as any).app?.api
  if (!api) {
    saving.value = false
    return
  }
  try {
    if (isEditMode.value) {
      const updatedInputs = inputs.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        config: toRaw(row.config),
      }))
      const updatedOutputs = outputs.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        config: toRaw(row.config),
        contentType: row.contentType,
        listenerDefaults: {
          filterMode: row.listenerDefaults.filterMode,
          filters: [
            {
              type: 'sessionCorrelation',
              config: {
                sentPath: row.listenerDefaults.sentPath,
                receivedPath: row.listenerDefaults.receivedPath,
                includeHistoricalSent: row.listenerDefaults.includeHistoricalSent,
              }
            }
          ]
        }
      }))
      await api.systems.update(props.systemId, {
        name: name.value.trim(),
        description: description.value.trim(),
        inputs: updatedInputs,
        outputs: updatedOutputs
      })
      await systemStore.loadSystems()
      const tabId = `system:${props.systemId}`
      const tab = uiStore.openTabs.find((t) => t.id === tabId)
      if (tab) tab.title = name.value.trim()
    } else {
      const createdInputs = inputs.map((row) => ({
        name: row.name,
        type: row.type,
        config: toRaw(row.config)
      }))
      const createdOutputs = outputs.map((row) => ({
        name: row.name,
        type: row.type,
        config: toRaw(row.config),
        contentType: row.contentType,
        listenerDefaults: {
          filterMode: row.listenerDefaults.filterMode,
          filters: [
            {
              type: 'sessionCorrelation',
              config: {
                sentPath: row.listenerDefaults.sentPath,
                receivedPath: row.listenerDefaults.receivedPath,
                includeHistoricalSent: row.listenerDefaults.includeHistoricalSent,
              }
            }
          ]
        }
      }))
      await api.systems.create({
        name: name.value.trim(),
        description: description.value.trim(),
        inputs: createdInputs,
        outputs: createdOutputs
      })
      await systemStore.loadSystems()
      uiStore.closeTab('system:new')
    }
  } catch (e) {
    console.debug("Failed to save system", e);
    errorMessage.value = 'Failed to save system.'
  } finally {
    saving.value = false
  }
}

async function deleteSystem(): Promise<void> {
  if (!confirm(`Delete system "${name.value}"? This action cannot be undone.`)) return
  deleting.value = true
  const api = (window as any).app?.api
  if (!api) {
    deleting.value = false
    return
  }
  try {
    await api.systems.delete(props.systemId)
    await systemStore.loadSystems()
    uiStore.closeTab(`system:${props.systemId}`)
  } catch {
    errorMessage.value = 'Failed to delete system.'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="system-editor">
    <header class="system-editor__header">
      <h2 class="system-editor__title">{{ isEditMode ? 'Edit System' : 'New System' }}</h2>
      <div class="system-editor__actions">
        <button
          class="system-editor__btn system-editor__btn--primary"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          v-if="isEditMode"
          class="system-editor__btn system-editor__btn--danger"
          :disabled="deleting"
          @click="deleteSystem"
        >
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="system-editor__error" role="alert">{{ errorMessage }}</p>

    <section class="system-editor__section">
      <div class="system-editor__field">
        <label class="system-editor__label" for="sys-name">Name</label>
        <input
          id="sys-name"
          v-model="name"
          class="system-editor__input"
          type="text"
          placeholder="e.g. My Production System"
        />
      </div>
      <div class="system-editor__field">
        <label class="system-editor__label" for="sys-desc">Description</label>
        <textarea
          id="sys-desc"
          v-model="description"
          class="system-editor__textarea"
          rows="2"
          placeholder="Optional description"
        />
      </div>
    </section>

    <!-- Inputs section -->
    <section class="system-editor__section">
      <div class="system-editor__section-header">
        <h3 class="system-editor__section-title">Inputs</h3>
        <button class="system-editor__add-btn" @click="addInput">+ Add Input</button>
      </div>
      <p class="system-editor__hint">
        Config fields support <code v-pre>{{ variable }}</code> placeholders.
      </p>
      <div
        v-for="(row, idx) in inputs"
        :key="idx"
        class="system-editor__io-row"
        data-testid="input-row"
      >
        <div class="system-editor__io-meta">
          <div class="system-editor__field system-editor__field--inline">
            <label class="system-editor__label">Name</label>
            <input v-model="row.name" class="system-editor__input" type="text" placeholder="Input name" />
          </div>
          <div class="system-editor__field system-editor__field--inline">
            <label class="system-editor__label">Type</label>
            <select
              class="system-editor__select"
              :value="row.type"
              @change="onInputTypeChange(row, ($event.target as HTMLSelectElement).value as InputType)"
            >
              <option v-for="t in INPUT_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <button class="system-editor__delete-btn" title="Remove input" @click="removeInput(idx)">✕</button>
        </div>
        <div class="system-editor__config-fields">
          <div
            v-for="field in INPUT_CONFIG_FIELDS[row.type]"
            :key="field"
            class="system-editor__field system-editor__field--inline"
          >
            <label class="system-editor__label">{{ field }}</label>
            <input
              v-model="row.config[field]"
              class="system-editor__input"
              type="text"
              :placeholder="`e.g. {{ ${field} }}`"
            />
          </div>
        </div>
      </div>
      <p v-if="inputs.length === 0" class="system-editor__empty">No inputs configured.</p>
    </section>

    <!-- Outputs section -->
    <section class="system-editor__section">
      <div class="system-editor__section-header">
        <h3 class="system-editor__section-title">Outputs</h3>
        <button class="system-editor__add-btn" @click="addOutput">+ Add Output</button>
      </div>
      <p class="system-editor__hint">
        Config fields support <code v-pre>{{ variable }}</code> placeholders.
      </p>
      <div
        v-for="(row, idx) in outputs"
        :key="idx"
        class="system-editor__io-row"
        data-testid="output-row"
      >
        <div class="system-editor__io-meta">
          <div class="system-editor__field system-editor__field--inline">
            <label class="system-editor__label">Name</label>
            <input v-model="row.name" class="system-editor__input" type="text" placeholder="Output name" />
          </div>
          <div class="system-editor__field system-editor__field--inline">
            <label class="system-editor__label">Type</label>
            <select
              class="system-editor__select"
              :value="row.type"
              @change="onOutputTypeChange(row, ($event.target as HTMLSelectElement).value as OutputType)"
            >
              <option v-for="t in OUTPUT_TYPES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <button class="system-editor__delete-btn" title="Remove output" @click="removeOutput(idx)">✕</button>
        </div>
        <div class="system-editor__config-fields">
          <div
            v-for="field in OUTPUT_CONFIG_FIELDS[row.type]"
            :key="field"
            class="system-editor__field system-editor__field--inline"
          >
            <label class="system-editor__label">{{ field }}</label>
            <input
              v-model="row.config[field]"
              class="system-editor__input"
              type="text"
              :placeholder="`e.g. {{ ${field} }}`"
            />
          </div>
        </div>
        <div class="system-editor__listener-defaults">
          <div class="system-editor__field system-editor__field--inline">
            <label class="system-editor__label">Default Filter Mode</label>
            <select v-model="row.listenerDefaults.filterMode" class="system-editor__select">
              <option value="all">all</option>
              <option value="any">any</option>
            </select>
          </div>
          <div class="system-editor__field system-editor__field--inline">
            <label class="system-editor__label">Sent Path</label>
            <input v-model="row.listenerDefaults.sentPath" class="system-editor__input" type="text" placeholder="$.id" />
          </div>
          <div class="system-editor__field system-editor__field--inline">
            <label class="system-editor__label">Received Path</label>
            <input v-model="row.listenerDefaults.receivedPath" class="system-editor__input" type="text" placeholder="$.eventId" />
          </div>
          <label class="system-editor__toggle-label">
            <input v-model="row.listenerDefaults.includeHistoricalSent" type="checkbox" />
            Include sent events already in this session
          </label>
        </div>
      </div>
      <p v-if="outputs.length === 0" class="system-editor__empty">No outputs configured.</p>
    </section>
  </div>
</template>

<style scoped>
.system-editor {
  padding: 24px;
  max-width: 800px;
  color: #cdd6f4;
}

.system-editor__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.system-editor__title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  flex: 1;
  color: #cdd6f4;
}

.system-editor__actions {
  display: flex;
  gap: 8px;
}

.system-editor__btn {
  padding: 6px 14px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.system-editor__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.system-editor__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.system-editor__btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.system-editor__btn--danger {
  background: #f38ba8;
  color: #1e1e2e;
}

.system-editor__btn--danger:hover:not(:disabled) {
  background: #eba0ac;
}

.system-editor__error {
  color: #f38ba8;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: 5px;
  border: 1px solid rgba(243, 139, 168, 0.3);
}

.system-editor__section {
  margin-bottom: 28px;
}

.system-editor__section-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.system-editor__section-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #89b4fa;
  margin: 0;
  flex: 1;
}

.system-editor__add-btn {
  background: none;
  border: 1px solid #89b4fa;
  color: #89b4fa;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.system-editor__add-btn:hover {
  background: rgba(137, 180, 250, 0.1);
}

.system-editor__hint {
  font-size: 11px;
  color: #585b70;
  margin: 0 0 10px;
}

.system-editor__hint code {
  background: #313244;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
  color: #a6e3a1;
}

.system-editor__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.system-editor__field--inline {
  flex: 1;
  min-width: 140px;
  margin-bottom: 0;
}

.system-editor__label {
  font-size: 11px;
  font-weight: 500;
  color: #a6adc8;
  text-transform: capitalize;
}

.system-editor__input,
.system-editor__select,
.system-editor__textarea {
  background: #181825;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 5px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}

.system-editor__input:focus,
.system-editor__select:focus,
.system-editor__textarea:focus {
  border-color: #89b4fa;
}

.system-editor__textarea {
  resize: vertical;
}

.system-editor__io-row {
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  background: #181825;
}

.system-editor__io-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 10px;
}

.system-editor__config-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.system-editor__listener-defaults {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #313244;
}

.system-editor__toggle-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a6adc8;
  font-size: 12px;
}

.system-editor__delete-btn {
  background: none;
  border: 1px solid #f38ba8;
  color: #f38ba8;
  font-size: 12px;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  align-self: flex-end;
}

.system-editor__delete-btn:hover {
  background: rgba(243, 139, 168, 0.1);
}

.system-editor__empty {
  font-size: 12px;
  color: #45475a;
  font-style: italic;
}
</style>
