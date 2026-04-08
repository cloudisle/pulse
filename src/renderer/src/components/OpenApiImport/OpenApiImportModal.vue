<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useOpenApiImportStore } from '@renderer/stores/openapi-import.store'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useSystemStore } from '@renderer/stores/system'
import SchemaElementRow from '@renderer/components/SchemaEditor/SchemaElementRow.vue'
import type { SchemaElement, BuiltInType } from '@shared/models/schema'
import type { StrategyType } from '@shared/models/generation'
import type { ValidationWarning } from '@shared/models/event'

const store = useOpenApiImportStore()
const schemaStore = useSchemaStore()
const systemStore = useSystemStore()

// ── Step 1 ──────────────────────────────────────────────────────────────────

const pastedContent = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function onChooseFile(): void {
  fileInput.value?.click()
}

function onFileChange(event: Event): void {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    store.submitContent(content)
  }
  reader.readAsText(file)
}

// ── Step 2 ──────────────────────────────────────────────────────────────────

const localSelected = ref<string[]>([])

watch(
  () => store.step,
  (s) => {
    if (s === 'select') {
      localSelected.value = store.parsedSchemas.map((p) => p.name)
    }
  }
)

function isExisting(name: string): boolean {
  return schemaStore.schemas.some((s) => s.name.toLowerCase() === name.toLowerCase())
}

function selectAll(): void {
  localSelected.value = store.parsedSchemas.map((p) => p.name)
}

function deselectAll(): void {
  localSelected.value = []
}

function onNext(): void {
  store.confirmSelection([...localSelected.value])
}

function goBackToProvide(): void {
  store.parsedSchemas = []
  store.parseError = null
  store.step = 'provide'
  pastedContent.value = ''
}

// ── Step 3 ──────────────────────────────────────────────────────────────────

const customTypes = ref<{ id: string; name: string }[]>([])
const BUILT_IN_TYPES: BuiltInType[] = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']
const STRATEGY_TYPES: StrategyType[] = ['random', 'faker', 'enum', 'pattern', 'range', 'constant', 'template']
const constraintsExpanded = ref(new Set<string>())
const dragOverIndex = ref<number | null>(null)
const draggingIndex = ref<number | null>(null)
const draggingSchemaIdx = ref<number | null>(null)
const expandedCards = ref<Set<number>>(new Set())

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

function toggleCard(idx: number): void {
  if (expandedCards.value.has(idx)) {
    expandedCards.value.delete(idx)
  } else {
    expandedCards.value.add(idx)
  }
}

function toggleConstraints(path: string): void {
  if (constraintsExpanded.value.has(path)) {
    constraintsExpanded.value.delete(path)
  } else {
    constraintsExpanded.value.add(path)
  }
}

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

function addElement(elements: SchemaElement[]): void {
  elements.push(defaultElement())
}

function removeElement(elements: SchemaElement[], idx: number): void {
  elements.splice(idx, 1)
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

function onDragStart(schemaIdx: number, elIdx: number): void {
  draggingSchemaIdx.value = schemaIdx
  draggingIndex.value = elIdx
}

function onDragOver(elIdx: number): void {
  dragOverIndex.value = elIdx
}

function onDrop(elements: SchemaElement[], schemaIdx: number, elIdx: number): void {
  if (draggingIndex.value === null || draggingSchemaIdx.value !== schemaIdx || draggingIndex.value === elIdx) {
    draggingIndex.value = null
    dragOverIndex.value = null
    return
  }
  const moved = elements.splice(draggingIndex.value, 1)[0]
  elements.splice(elIdx, 0, moved)
  draggingIndex.value = null
  dragOverIndex.value = null
}

function onDragEnd(): void {
  draggingIndex.value = null
  dragOverIndex.value = null
  draggingSchemaIdx.value = null
}

function warningsForPath(_path: string): ValidationWarning[] {
  return []
}

const stepTitle = computed(() => {
  switch (store.step) {
    case 'provide': return 'Import OpenAPI File'
    case 'select': return 'Select Schemas to Import'
    case 'edit': return 'Review & Edit Schemas'
  }
})

// ── Escape key ──────────────────────────────────────────────────────────────

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') store.close()
}

onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  await loadCustomTypes()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="oai-overlay" data-testid="oai-overlay" @click.self="store.close()">
      <div class="oai-panel">
        <!-- Header -->
        <div class="oai-header">
          <span class="oai-title">{{ stepTitle }}</span>
          <button class="oai-close" aria-label="Close" @click="store.close()">✕</button>
        </div>

        <!-- Step indicator -->
        <div class="oai-steps">
          <span class="oai-step" :class="{ 'oai-step--active': store.step === 'provide' }">1 Provide</span>
          <span class="oai-step-sep">›</span>
          <span class="oai-step" :class="{ 'oai-step--active': store.step === 'select' }">2 Select</span>
          <span class="oai-step-sep">›</span>
          <span class="oai-step" :class="{ 'oai-step--active': store.step === 'edit' }">3 Edit &amp; Save</span>
        </div>

        <!-- Step 1: Provide -->
        <div v-if="store.step === 'provide'" class="oai-body">
          <div class="oai-field">
            <label class="oai-label">Paste OpenAPI content (JSON or YAML)</label>
            <textarea
              v-model="pastedContent"
              class="oai-textarea"
              rows="10"
              data-testid="paste-textarea"
              placeholder="Paste your OpenAPI 3.x JSON or YAML here…"
            />
            <button
              class="oai-btn oai-btn--primary"
              :disabled="!pastedContent.trim() || store.parsing"
              data-testid="parse-btn"
              @click="store.submitContent(pastedContent)"
            >
              {{ store.parsing ? 'Parsing…' : 'Parse' }}
            </button>
          </div>

          <div class="oai-divider">
            <span>or</span>
          </div>

          <div class="oai-field">
            <label class="oai-label">Or load from file</label>
            <input
              ref="fileInput"
              type="file"
              accept=".json,.yaml,.yml"
              class="oai-file-hidden"
              @change="onFileChange"
            />
            <button
              class="oai-btn oai-btn--secondary"
              data-testid="choose-file-btn"
              @click="onChooseFile"
            >
              Choose File (.json / .yaml / .yml)
            </button>
          </div>

          <p v-if="store.parseError" class="oai-error" role="alert" data-testid="parse-error">
            {{ store.parseError }}
          </p>
        </div>

        <!-- Step 2: Select -->
        <div v-else-if="store.step === 'select'" class="oai-body">
          <p class="oai-subtitle">Found {{ store.parsedSchemas.length }} schema(s) in the provided file.</p>

          <div class="oai-select-actions">
            <button class="oai-btn oai-btn--secondary oai-btn--sm" @click="selectAll">Select All</button>
            <button class="oai-btn oai-btn--secondary oai-btn--sm" @click="deselectAll">Deselect All</button>
          </div>

          <ul class="oai-schema-list" data-testid="schema-list">
            <li v-for="schema in store.parsedSchemas" :key="schema.name" class="oai-schema-row">
              <label class="oai-schema-label">
                <input
                  v-model="localSelected"
                  type="checkbox"
                  :value="schema.name"
                  class="oai-checkbox"
                  :data-testid="`schema-checkbox-${schema.name}`"
                />
                <span class="oai-schema-name">{{ schema.name }}</span>
                <span v-if="schema.description" class="oai-schema-desc">{{ schema.description }}</span>
                <span class="oai-badge oai-badge--muted">{{ schema.elements.length }} fields</span>
                <span v-if="isExisting(schema.name)" class="oai-badge oai-badge--accent">Update</span>
              </label>
            </li>
          </ul>

          <div class="oai-footer">
            <button class="oai-btn oai-btn--secondary" @click="goBackToProvide">← Back</button>
            <button
              class="oai-btn oai-btn--primary"
              :disabled="localSelected.length === 0"
              data-testid="next-btn"
              @click="onNext"
            >
              Next →
            </button>
          </div>
        </div>

        <!-- Step 3: Edit & Save -->
        <div v-else-if="store.step === 'edit'" class="oai-body">
          <div
            v-for="(es, schemaIdx) in store.editingSchemas"
            :key="es.originalName"
            class="oai-card"
            :data-testid="`edit-card-${es.originalName}`"
          >
            <div class="oai-card-header">
              <input v-model="es.name" class="oai-input oai-input--name" type="text" placeholder="Schema name…" />
              <input v-model="es.description" class="oai-input oai-input--desc" type="text" placeholder="Description…" />
              <span
                class="oai-badge"
                :class="es.action === 'create' ? 'oai-badge--create' : 'oai-badge--accent'"
              >
                {{ es.action === 'create' ? 'Create' : 'Update' }}
              </span>
              <button class="oai-chevron" @click="toggleCard(schemaIdx)">
                {{ expandedCards.has(schemaIdx) ? '▾' : '▸' }}
              </button>
            </div>

            <div v-if="expandedCards.has(schemaIdx)" class="oai-card-body">
              <SchemaElementRow
                v-for="(el, idx) in es.elements"
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
                @remove="removeElement(es.elements, idx)"
                @add-child="el.children?.push(defaultElement())"
                @strategy-change="onStrategyChange(el, $event)"
                @data-type-change="onDataTypeChange(el, $event)"
                @toggle-constraints="toggleConstraints(el.name || String(idx))"
                @add-enum-value="addEnumValue(el, $event)"
                @remove-enum-value="removeEnumValue(el, $event)"
                @drag-start="onDragStart(schemaIdx, idx)"
                @drag-over="onDragOver(idx)"
                @drop="onDrop(es.elements, schemaIdx, idx)"
                @drag-end="onDragEnd"
              />

              <button
                class="oai-add-element-btn"
                @click="addElement(es.elements)"
              >
                + Add Element
              </button>
            </div>

            <p
              v-if="store.saveErrors[es.originalName]"
              class="oai-error"
              role="alert"
              :data-testid="`save-error-${es.originalName}`"
            >
              {{ store.saveErrors[es.originalName] }}
            </p>
          </div>

          <div class="oai-footer">
            <button class="oai-btn oai-btn--secondary" @click="store.step = 'select'">← Back</button>
            <button
              class="oai-btn oai-btn--primary"
              :disabled="store.saving"
              data-testid="save-all-btn"
              @click="store.saveAll(systemStore.selectedSystemId!)"
            >
              {{ store.saving ? 'Saving…' : 'Save All' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.oai-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.oai-panel {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 8px;
  max-width: 680px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.oai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid #313244;
}

.oai-title {
  font-size: 16px;
  font-weight: 600;
  color: #cdd6f4;
}

.oai-close {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 16px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.oai-close:hover {
  background: #313244;
  color: #cdd6f4;
}

.oai-steps {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-bottom: 1px solid #313244;
}

.oai-step {
  font-size: 12px;
  color: #585b70;
  padding: 2px 8px;
  border-radius: 12px;
}

.oai-step--active {
  color: #89b4fa;
  background: rgba(137, 180, 250, 0.12);
  font-weight: 500;
}

.oai-step-sep {
  color: #45475a;
  font-size: 12px;
}

.oai-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.oai-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oai-label {
  font-size: 13px;
  color: #cdd6f4;
  font-weight: 500;
}

.oai-textarea {
  background: #181825;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  padding: 8px 10px;
  border-radius: 5px;
  outline: none;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}

.oai-textarea:focus {
  border-color: #89b4fa;
}

.oai-file-hidden {
  display: none;
}

.oai-btn {
  padding: 7px 16px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  align-self: flex-start;
}

.oai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.oai-btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.oai-btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.oai-btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
}

.oai-btn--secondary:hover:not(:disabled) {
  background: #45475a;
}

.oai-btn--sm {
  padding: 4px 10px;
  font-size: 12px;
}

.oai-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #585b70;
  font-size: 12px;
}

.oai-divider::before,
.oai-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #313244;
}

.oai-error {
  color: #f38ba8;
  font-size: 13px;
  padding: 8px 12px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: 5px;
  border: 1px solid rgba(243, 139, 168, 0.3);
  margin: 0;
}

.oai-subtitle {
  font-size: 13px;
  color: #a6adc8;
  margin: 0;
}

.oai-select-actions {
  display: flex;
  gap: 8px;
}

.oai-schema-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.oai-schema-row {
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid #313244;
  background: #181825;
}

.oai-schema-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #cdd6f4;
}

.oai-checkbox {
  accent-color: #89b4fa;
  cursor: pointer;
}

.oai-schema-name {
  font-weight: 600;
}

.oai-schema-desc {
  color: #a6adc8;
  font-size: 12px;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.oai-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 10px;
  font-weight: 500;
  white-space: nowrap;
}

.oai-badge--muted {
  background: rgba(88, 91, 112, 0.3);
  color: #a6adc8;
}

.oai-badge--accent {
  background: rgba(137, 180, 250, 0.15);
  color: #89b4fa;
  border: 1px solid rgba(137, 180, 250, 0.4);
}

.oai-badge--create {
  background: rgba(166, 227, 161, 0.15);
  color: #a6e3a1;
  border: 1px solid rgba(166, 227, 161, 0.4);
}

.oai-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
}

.oai-card {
  border: 1px solid #313244;
  border-radius: 6px;
  overflow: hidden;
}

.oai-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #181825;
}

.oai-input {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}

.oai-input:focus {
  border-color: #89b4fa;
}

.oai-input--name {
  font-weight: 600;
  width: 160px;
}

.oai-input--desc {
  flex: 1;
  color: #a6adc8;
}

.oai-chevron {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
}

.oai-chevron:hover {
  color: #cdd6f4;
}

.oai-card-body {
  padding: 12px;
  border-top: 1px solid #313244;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.oai-add-element-btn {
  background: none;
  border: 1px dashed #45475a;
  color: #89b4fa;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 5px;
  cursor: pointer;
  align-self: flex-start;
}

.oai-add-element-btn:hover {
  background: rgba(137, 180, 250, 0.08);
  border-color: #89b4fa;
}
</style>
