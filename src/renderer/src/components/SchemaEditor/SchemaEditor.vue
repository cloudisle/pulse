<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import SchemaElementRow from './SchemaElementRow.vue'
import type { Schema, SchemaElement, BuiltInType } from '@shared/models/schema'
import type { StrategyType } from '@shared/models/generation'
import type { ValidationWarning } from '@shared/models/event'

const props = defineProps<{
  schemaId?: string
}>()

const uiStore = useUiStore()
const systemStore = useSystemStore()
const schemaStore = useSchemaStore()

const isEditMode = computed(() => !!props.schemaId && props.schemaId !== 'new')

const schemaName = ref('')
const schemaDescription = ref('')
const elements = reactive<SchemaElement[]>([])

const errorMessage = ref('')
const saving = ref(false)
const validating = ref(false)
const validationWarnings = ref<ValidationWarning[]>([])

const customTypes = ref<{ id: string; name: string }[]>([])

const BUILT_IN_TYPES: BuiltInType[] = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']
const STRATEGY_TYPES: StrategyType[] = ['random', 'faker', 'enum', 'pattern', 'range', 'constant', 'template']

async function loadCustomTypes(): Promise<void> {
  const api = (window as any).app?.api
  if (!api || !systemStore.selectedSystemId) return
  try {
    const types = await api.customTypes.list(systemStore.selectedSystemId)
    customTypes.value = types.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))
  } catch {
    customTypes.value = []
  }
}

function ensureConstraints(elements: SchemaElement[]): SchemaElement[] {
  return elements.map((el) => ({
    ...el,
    constraints: el.constraints ?? {},
    children: el.children ? ensureConstraints(el.children) : undefined
  }))
}

onMounted(async () => {
  await loadCustomTypes()
  if (!isEditMode.value) return
  const api = (window as any).app?.api
  if (!api || !systemStore.selectedSystemId) return
  try {
    const schema: Schema = await api.schemas.get(systemStore.selectedSystemId, props.schemaId)
    schemaName.value = schema.name ?? ''
    schemaDescription.value = schema.description ?? ''
    elements.push(...ensureConstraints(JSON.parse(JSON.stringify(schema.elements ?? []))))
  } catch {
    errorMessage.value = 'Failed to load schema.'
  }
})

watch(() => systemStore.selectedSystemId, loadCustomTypes)

// ─── Helpers ────────────────────────────────────────────────────────────────

function defaultStrategy(type: StrategyType = 'random') {
  switch (type) {
    case 'faker': return { type: 'faker', config: { method: '', locale: '' } }
    case 'enum': return { type: 'enum', config: { values: [] } }
    case 'pattern': return { type: 'pattern', config: { pattern: '' } }
    case 'range': return { type: 'range', config: { min: 0, max: 100, step: 1, decimals: 0 } }
    case 'constant': return { type: 'constant', config: { value: '' } }
    case 'template': return { type: 'template', config: { template: '' } }
    default: return { type: 'random', config: {} }
  }
}

function defaultElement(): SchemaElement {
  return {
    name: '',
    required: false,
    dataType: { type: 'string' },
    generationStrategy: defaultStrategy('random') as any,
    constraints: {}
  }
}

function addElement(): void {
  elements.push(defaultElement())
}

function removeElement(index: number): void {
  elements.splice(index, 1)
}

function onStrategyChange(el: SchemaElement, type: StrategyType): void {
  el.generationStrategy = defaultStrategy(type) as any
}

function onDataTypeChange(el: SchemaElement, newType: string): void {
  if (customTypes.value.some((ct) => ct.id === newType)) {
    el.dataType = { type: newType, customTypeId: newType }
  } else {
    el.dataType = { type: newType as BuiltInType }
  }
  if (newType !== 'object' && newType !== 'array') {
    el.children = undefined
  } else if (!el.children) {
    el.children = []
  }
}

// Enum value management
function addEnumValue(el: SchemaElement, input: HTMLInputElement): void {
  const val = input.value.trim()
  if (!val) return
  const config = el.generationStrategy.config as { values: any[] }
  config.values.push(val)
  input.value = ''
}

function removeEnumValue(el: SchemaElement, idx: number): void {
  const config = el.generationStrategy.config as { values: any[] }
  config.values.splice(idx, 1)
}

// Constraints expand/collapse state (keyed by element path)
const constraintsExpanded = ref(new Set<string>())

function toggleConstraints(path: string): void {
  if (constraintsExpanded.value.has(path)) {
    constraintsExpanded.value.delete(path)
  } else {
    constraintsExpanded.value.add(path)
  }
}

// Drag-and-drop
const draggingIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function onDragStart(idx: number): void { draggingIndex.value = idx }
function onDragOver(idx: number): void { dragOverIndex.value = idx }

function onDrop(idx: number): void {
  if (draggingIndex.value === null || draggingIndex.value === idx) {
    draggingIndex.value = null
    dragOverIndex.value = null
    return
  }
  const moved = elements.splice(draggingIndex.value, 1)[0]
  elements.splice(idx, 0, moved)
  draggingIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd(): void {
  draggingIndex.value = null
  dragOverIndex.value = null
}

// Warnings per element path
function warningsForPath(path: string): ValidationWarning[] {
  return validationWarnings.value.filter(
    (w) => w.elementPath === path || w.elementPath.startsWith(path + '.')
  )
}

// ─── Save / Validate ────────────────────────────────────────────────────────

async function save(): Promise<void> {
  if (!schemaName.value.trim()) {
    errorMessage.value = 'Schema name is required.'
    return
  }
  errorMessage.value = ''
  saving.value = true
  const api = (window as any).app?.api
  if (!api) { saving.value = false; return }
  try {
    const systemId = systemStore.selectedSystemId
    if (!systemId) throw new Error('No system selected')
    const payload = {
      name: schemaName.value.trim(),
      description: schemaDescription.value.trim(),
      elements: JSON.parse(JSON.stringify(elements))
    }
    if (isEditMode.value) {
      await api.schemas.update(systemId, props.schemaId, payload)
      await schemaStore.list(systemId)
      const tabId = `schema:${props.schemaId}`
      const tab = uiStore.openTabs.find((t) => t.id === tabId)
      if (tab) tab.title = schemaName.value.trim()
    } else {
      const created: Schema = await api.schemas.create({ systemId, ...payload })
      await schemaStore.list(systemId)
      uiStore.closeTab('schema:new')
      uiStore.openTab({ id: `schema:${created.id}`, type: 'schema', title: created.name })
    }
  } catch {
    errorMessage.value = 'Failed to save schema.'
  } finally {
    saving.value = false
  }
}

async function validate(): Promise<void> {
  if (!isEditMode.value) {
    errorMessage.value = 'Save the schema first before validating.'
    return
  }
  validating.value = true
  validationWarnings.value = []
  errorMessage.value = ''
  const api = (window as any).app?.api
  if (!api) { validating.value = false; return }
  try {
    const systemId = systemStore.selectedSystemId
    if (!systemId) throw new Error('No system selected')
    const result = await api.schemas.validate(systemId, props.schemaId)
    validationWarnings.value = result.warnings ?? []
  } catch {
    errorMessage.value = 'Failed to validate schema.'
  } finally {
    validating.value = false
  }
}
</script>

<template>
  <div class="schema-editor">
    <!-- Header -->
    <header class="schema-editor__header">
      <div class="schema-editor__header-fields">
        <input
          v-model="schemaName"
          class="schema-editor__name-input"
          type="text"
          placeholder="Schema name…"
          data-testid="schema-name"
        />
        <input
          v-model="schemaDescription"
          class="schema-editor__desc-input"
          type="text"
          placeholder="Description (optional)…"
          data-testid="schema-description"
        />
      </div>
      <div class="schema-editor__header-actions">
        <button
          class="schema-editor__btn schema-editor__btn--secondary"
          :disabled="validating"
          data-testid="validate-btn"
          @click="validate"
        >
          {{ validating ? 'Validating…' : 'Validate' }}
        </button>
        <button
          class="schema-editor__btn schema-editor__btn--primary"
          :disabled="saving"
          data-testid="save-btn"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </header>

    <!-- Error message -->
    <p v-if="errorMessage" class="schema-editor__error" role="alert" data-testid="error-message">
      {{ errorMessage }}
    </p>

    <!-- Validation summary -->
    <div
      v-if="validationWarnings.length > 0"
      class="schema-editor__validation-summary"
      data-testid="validation-summary"
    >
      <span class="schema-editor__validation-count">
        {{ validationWarnings.length }} warning(s) found
      </span>
    </div>

    <!-- Element tree -->
    <section class="schema-editor__tree">
      <SchemaElementRow
        v-for="(el, idx) in elements"
        :key="idx"
        :element="el"
        :index="idx"
        :path="el.name || String(idx)"
        :custom-types="customTypes"
        :built-in-types="BUILT_IN_TYPES"
        :strategy-types="STRATEGY_TYPES"
        :constraints-expanded="constraintsExpanded"
        :drag-over-index="dragOverIndex"
        :warnings="warningsForPath(el.name || String(idx))"
        @remove="removeElement(idx)"
        @add-child="el.children?.push(defaultElement())"
        @strategy-change="onStrategyChange(el, $event)"
        @data-type-change="onDataTypeChange(el, $event)"
        @toggle-constraints="toggleConstraints(el.name || String(idx))"
        @add-enum-value="addEnumValue(el, $event)"
        @remove-enum-value="removeEnumValue(el, $event)"
        @drag-start="onDragStart(idx)"
        @drag-over="onDragOver(idx)"
        @drop="onDrop(idx)"
        @drag-end="onDragEnd"
      />

      <button
        class="schema-editor__add-btn"
        data-testid="add-element-btn"
        @click="addElement"
      >
        + Add Element
      </button>
    </section>
  </div>
</template>

<style scoped>
.schema-editor {
  padding: 24px;
  max-width: 900px;
  color: #cdd6f4;
}

.schema-editor__header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.schema-editor__header-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schema-editor__name-input {
  background: #181825;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 18px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 5px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.schema-editor__name-input:focus {
  border-color: #89b4fa;
}

.schema-editor__desc-input {
  background: #181825;
  border: 1px solid #313244;
  color: #a6adc8;
  font-size: 13px;
  padding: 5px 10px;
  border-radius: 5px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.schema-editor__desc-input:focus {
  border-color: #89b4fa;
}

.schema-editor__header-actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding-top: 2px;
}

.schema-editor__btn {
  padding: 6px 14px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
}

.schema-editor__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.schema-editor__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.schema-editor__btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.schema-editor__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
}

.schema-editor__btn--secondary:hover:not(:disabled) {
  background: #45475a;
}

.schema-editor__error {
  color: #f38ba8;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: 5px;
  border: 1px solid rgba(243, 139, 168, 0.3);
}

.schema-editor__validation-summary {
  font-size: 13px;
  color: #fab387;
  margin-bottom: 12px;
  padding: 6px 12px;
  background: rgba(250, 179, 135, 0.08);
  border-radius: 5px;
  border: 1px solid rgba(250, 179, 135, 0.25);
}

.schema-editor__validation-count {
  font-weight: 500;
}

.schema-editor__tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schema-editor__add-btn {
  background: none;
  border: 1px dashed #45475a;
  color: #89b4fa;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 5px;
  cursor: pointer;
  align-self: flex-start;
  margin-top: 4px;
}

.schema-editor__add-btn:hover {
  background: rgba(137, 180, 250, 0.08);
  border-color: #89b4fa;
}
</style>
