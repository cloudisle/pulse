<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SchemaElement, SchemaConstraints } from '../../../../../shared/models/schema'
import type { StrategyType } from '../../../../../shared/models/generation'
import type { ValidationWarning } from '../../../../../shared/models/event'

const props = defineProps<{
  element: SchemaElement
  index: number
  path: string
  customTypes: { id: string; name: string }[]
  builtInTypes: string[]
  strategyTypes: StrategyType[]
  constraintsExpanded: Set<string>
  dragOverIndex: number | null
  warnings: ValidationWarning[]
  depth?: number
}>()

const emit = defineEmits<{
  (e: 'remove'): void
  (e: 'add-child'): void
  (e: 'strategy-change', type: StrategyType): void
  (e: 'data-type-change', type: string): void
  (e: 'toggle-constraints'): void
  (e: 'add-enum-value', input: HTMLInputElement): void
  (e: 'remove-enum-value', index: number): void
  (e: 'drag-start'): void
  (e: 'drag-over'): void
  (e: 'drop'): void
  (e: 'drag-end'): void
}>()

const isObject = computed(() => props.element.dataType.type === 'object')
const isArray = computed(() => props.element.dataType.type === 'array')
const hasChildren = computed(() => isObject.value || isArray.value)
const strategyType = computed(() => props.element.generationStrategy.type)
const isConstraintsOpen = computed(() => props.constraintsExpanded.has(props.path))
const constraints = computed<SchemaConstraints>(() => props.element.constraints!)

const fakerConfig = computed(() => props.element.generationStrategy.config as { method: string; locale: string })
const enumConfig = computed(() => props.element.generationStrategy.config as { values: any[] })
const patternConfig = computed(() => props.element.generationStrategy.config as { pattern: string })
const rangeConfig = computed(() => props.element.generationStrategy.config as { min: number; max: number; step?: number; decimals?: number })
const constantConfig = computed(() => props.element.generationStrategy.config as { value: any })
const templateConfig = computed(() => props.element.generationStrategy.config as { template: string })

function onDataTypeChange(event: Event): void {
  emit('data-type-change', (event.target as HTMLSelectElement).value)
}

function onStrategyTypeChange(event: Event): void {
  emit('strategy-change', (event.target as HTMLSelectElement).value as StrategyType)
}

function addEnumByKey(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    emit('add-enum-value', event.target as HTMLInputElement)
  }
}

// Child drag state
const childDraggingIndex = ref<number | null>(null)
const childDragOverIndex = ref<number | null>(null)

function onChildDragStart(idx: number): void { childDraggingIndex.value = idx }
function onChildDragOver(idx: number): void { childDragOverIndex.value = idx }
function onChildDrop(idx: number): void {
  if (childDraggingIndex.value === null || childDraggingIndex.value === idx || !props.element.children) {
    childDraggingIndex.value = null
    childDragOverIndex.value = null
    return
  }
  const moved = props.element.children.splice(childDraggingIndex.value, 1)[0]
  props.element.children.splice(idx, 0, moved)
  childDraggingIndex.value = null
  childDragOverIndex.value = null
}
function onChildDragEnd(): void {
  childDraggingIndex.value = null
  childDragOverIndex.value = null
}

function addChildEnum(child: SchemaElement, input: HTMLInputElement): void {
  const config = child.generationStrategy.config as { values: any[] }
  const val = input.value.trim()
  if (!val) return
  config.values.push(val)
  input.value = ''
}

function removeChildEnum(child: SchemaElement, vi: number): void {
  const config = child.generationStrategy.config as { values: any[] }
  config.values.splice(vi, 1)
}

function defaultChildStrategy(type: StrategyType): { type: StrategyType; config: any } {
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

function onChildStrategyChange(child: SchemaElement, type: StrategyType): void {
  child.generationStrategy = defaultChildStrategy(type) as any
}

function onChildDataTypeChange(child: SchemaElement, newType: string): void {
  child.dataType = { type: newType as any }
  if (newType !== 'object' && newType !== 'array') {
    child.children = undefined
  } else if (!child.children) {
    child.children = []
  }
}

const childConstraintsExpanded = ref(new Set<string>())
function toggleChildConstraints(path: string): void {
  if (childConstraintsExpanded.value.has(path)) {
    childConstraintsExpanded.value.delete(path)
  } else {
    childConstraintsExpanded.value.add(path)
  }
}
</script>

<template>
  <div
    class="schema-editor__element"
    :class="{ 'schema-editor__element--drag-over': dragOverIndex === index }"
    draggable="true"
    data-testid="element-row"
    @dragstart="$emit('drag-start')"
    @dragover.prevent="$emit('drag-over')"
    @drop.prevent="$emit('drop')"
    @dragend="$emit('drag-end')"
  >
    <!-- Inline warnings -->
    <ul v-if="warnings.length > 0" class="schema-editor__warnings" data-testid="element-warnings">
      <li
        v-for="(w, wi) in warnings"
        :key="wi"
        :class="['schema-editor__warning', 'schema-editor__warning--' + w.severity]"
      >
        {{ w.message }}
      </li>
    </ul>

    <!-- Main row -->
    <div class="schema-editor__element-row">
      <span class="schema-editor__drag-handle" title="Drag to reorder">⠿</span>

      <input
        v-model="element.name"
        class="schema-editor__element-name"
        type="text"
        placeholder="Field name"
        data-testid="element-name"
      />

      <label class="schema-editor__required-label" title="Required">
        <input
          v-model="element.required"
          type="checkbox"
          data-testid="element-required"
        />
        <span>Req</span>
      </label>

      <select
        class="schema-editor__element-select"
        :value="element.dataType.type"
        data-testid="element-data-type"
        @change="onDataTypeChange"
      >
        <optgroup label="Built-in">
          <option v-for="t in builtInTypes" :key="t" :value="t">{{ t }}</option>
        </optgroup>
        <optgroup v-if="customTypes.length > 0" label="Custom Types">
          <option v-for="ct in customTypes" :key="ct.id" :value="ct.id">{{ ct.name }}</option>
        </optgroup>
      </select>

      <select
        class="schema-editor__element-select"
        :value="strategyType"
        data-testid="element-strategy"
        @change="onStrategyTypeChange"
      >
        <option v-for="s in strategyTypes" :key="s" :value="s">{{ s }}</option>
      </select>

      <button
        class="schema-editor__icon-btn schema-editor__icon-btn--danger"
        title="Delete element"
        data-testid="element-delete-btn"
        @click="$emit('remove')"
      >✕</button>
    </div>

    <!-- Strategy config -->
    <div class="schema-editor__strategy-config">
      <!-- faker -->
      <template v-if="strategyType === 'faker'">
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Method</label>
          <input
            v-model="fakerConfig.method"
            class="schema-editor__config-input"
            type="text"
            placeholder="e.g. person.firstName"
            data-testid="faker-method"
          />
        </div>
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Locale</label>
          <input
            v-model="fakerConfig.locale"
            class="schema-editor__config-input"
            type="text"
            placeholder="e.g. en"
            data-testid="faker-locale"
          />
        </div>
      </template>

      <!-- enum -->
      <template v-else-if="strategyType === 'enum'">
        <div class="schema-editor__config-row schema-editor__config-row--enum">
          <label class="schema-editor__config-label">Values</label>
          <div class="schema-editor__enum-tags" data-testid="enum-tags">
            <span
              v-for="(val, vi) in enumConfig.values"
              :key="vi"
              class="schema-editor__enum-tag"
            >
              {{ val }}
              <button
                class="schema-editor__enum-tag-remove"
                @click="$emit('remove-enum-value', vi)"
              >×</button>
            </span>
            <input
              class="schema-editor__config-input schema-editor__enum-input"
              type="text"
              placeholder="Add value, press Enter"
              data-testid="enum-value-input"
              @keydown="addEnumByKey"
            />
          </div>
        </div>
      </template>

      <!-- pattern -->
      <template v-else-if="strategyType === 'pattern'">
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Pattern</label>
          <input
            v-model="patternConfig.pattern"
            class="schema-editor__config-input"
            type="text"
            placeholder='e.g. [A-Z]{3}-\d{4}'
            data-testid="pattern-input"
          />
        </div>
      </template>

      <!-- range -->
      <template v-else-if="strategyType === 'range'">
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Min</label>
          <input v-model.number="rangeConfig.min" class="schema-editor__config-input" type="number" data-testid="range-min" />
        </div>
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Max</label>
          <input v-model.number="rangeConfig.max" class="schema-editor__config-input" type="number" data-testid="range-max" />
        </div>
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Step</label>
          <input v-model.number="rangeConfig.step" class="schema-editor__config-input" type="number" data-testid="range-step" />
        </div>
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Decimals</label>
          <input v-model.number="rangeConfig.decimals" class="schema-editor__config-input" type="number" data-testid="range-decimals" />
        </div>
      </template>

      <!-- constant -->
      <template v-else-if="strategyType === 'constant'">
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Value</label>
          <input
            v-model="constantConfig.value"
            class="schema-editor__config-input"
            type="text"
            placeholder="Constant value"
            data-testid="constant-value"
          />
        </div>
      </template>

      <!-- template -->
      <template v-else-if="strategyType === 'template'">
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Template</label>
          <input
            v-model="templateConfig.template"
            class="schema-editor__config-input"
            type="text"
            placeholder="e.g. ORD-{{ uuid }}"
            data-testid="template-input"
          />
        </div>
      </template>

      <!-- random: no config needed -->
    </div>

    <!-- Constraints (expandable) -->
    <div class="schema-editor__constraints">
      <button
        class="schema-editor__constraints-toggle"
        data-testid="constraints-toggle"
        @click="$emit('toggle-constraints')"
      >
        {{ isConstraintsOpen ? '▾' : '▸' }} Constraints
      </button>
      <div v-if="isConstraintsOpen" class="schema-editor__constraints-body" data-testid="constraints-body">
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">minLength</label>
          <input
            v-model.number="constraints.minLength"
            class="schema-editor__config-input"
            type="number"
            placeholder="—"
            data-testid="constraint-minLength"
          />
        </div>
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">maxLength</label>
          <input
            v-model.number="constraints.maxLength"
            class="schema-editor__config-input"
            type="number"
            placeholder="—"
            data-testid="constraint-maxLength"
          />
        </div>
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Pattern</label>
          <input
            v-model="constraints.pattern"
            class="schema-editor__config-input"
            type="text"
            placeholder="—"
            data-testid="constraint-pattern"
          />
        </div>
        <div class="schema-editor__config-row">
          <label class="schema-editor__config-label">Format</label>
          <input
            v-model="constraints.format"
            class="schema-editor__config-input"
            type="text"
            placeholder="e.g. date-time"
            data-testid="constraint-format"
          />
        </div>
      </div>
    </div>

    <!-- Nested children (object/array) -->
    <div v-if="hasChildren" class="schema-editor__children">
      <SchemaElementRow
        v-for="(child, ci) in element.children"
        :key="ci"
        :element="child"
        :index="ci"
        :path="path + '.' + (child.name || String(ci))"
        :custom-types="customTypes"
        :built-in-types="builtInTypes"
        :strategy-types="strategyTypes"
        :constraints-expanded="childConstraintsExpanded"
        :drag-over-index="childDragOverIndex"
        :warnings="[]"
        :depth="(depth ?? 0) + 1"
        @remove="element.children!.splice(ci, 1)"
        @add-child="child.children ? child.children.push({ name: '', required: false, dataType: { type: 'string' }, generationStrategy: { type: 'random', config: {} }, constraints: {} }) : null"
        @strategy-change="onChildStrategyChange(child, $event)"
        @data-type-change="onChildDataTypeChange(child, $event)"
        @toggle-constraints="toggleChildConstraints(path + '.' + (child.name || String(ci)))"
        @add-enum-value="addChildEnum(child, $event)"
        @remove-enum-value="removeChildEnum(child, $event)"
        @drag-start="onChildDragStart(ci)"
        @drag-over="onChildDragOver(ci)"
        @drop="onChildDrop(ci)"
        @drag-end="onChildDragEnd"
      />
      <button
        class="schema-editor__add-btn schema-editor__add-btn--child"
        data-testid="add-child-btn"
        @click="$emit('add-child')"
      >
        + Add Child
      </button>
    </div>
  </div>
</template>

<script lang="ts">
// Self-referential registration for recursive use
export default {
  name: 'SchemaElementRow'
}
</script>

<style>
.schema-editor__element {
  border: 1px solid #313244;
  border-radius: 6px;
  background: #181825;
  padding: 10px 12px;
}

.schema-editor__element--drag-over {
  border-color: #89b4fa;
}

.schema-editor__element-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.schema-editor__drag-handle {
  color: #45475a;
  cursor: grab;
  font-size: 16px;
  flex-shrink: 0;
}

.schema-editor__element-name {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  min-width: 120px;
  flex: 1;
}

.schema-editor__element-name:focus {
  border-color: #89b4fa;
}

.schema-editor__required-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #a6adc8;
  white-space: nowrap;
  cursor: pointer;
}

.schema-editor__element-select {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 4px;
  outline: none;
}

.schema-editor__element-select:focus {
  border-color: #89b4fa;
}

.schema-editor__icon-btn {
  background: none;
  border: 1px solid transparent;
  font-size: 13px;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.schema-editor__icon-btn--danger {
  border-color: #f38ba8;
  color: #f38ba8;
}

.schema-editor__icon-btn--danger:hover {
  background: rgba(243, 139, 168, 0.1);
}

.schema-editor__strategy-config {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #313244;
}

.schema-editor__config-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.schema-editor__config-row--enum {
  align-items: flex-start;
  flex-direction: column;
}

.schema-editor__config-label {
  font-size: 11px;
  color: #a6adc8;
  white-space: nowrap;
  min-width: 60px;
}

.schema-editor__config-input {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  padding: 3px 7px;
  border-radius: 4px;
  outline: none;
  width: 140px;
}

.schema-editor__config-input:focus {
  border-color: #89b4fa;
}

.schema-editor__enum-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.schema-editor__enum-tag {
  background: #313244;
  color: #cdd6f4;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.schema-editor__enum-tag-remove {
  background: none;
  border: none;
  color: #f38ba8;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  line-height: 1;
}

.schema-editor__enum-input {
  width: 160px;
}

.schema-editor__constraints {
  margin-top: 6px;
}

.schema-editor__constraints-toggle {
  background: none;
  border: none;
  color: #6c7086;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 0;
}

.schema-editor__constraints-toggle:hover {
  color: #a6adc8;
}

.schema-editor__constraints-body {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  padding: 8px;
  background: #1e1e2e;
  border-radius: 4px;
  border: 1px solid #313244;
}

.schema-editor__children {
  margin-top: 8px;
  padding-left: 20px;
  border-left: 2px solid #313244;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.schema-editor__warnings {
  list-style: none;
  padding: 0;
  margin: 0 0 6px;
}

.schema-editor__warning {
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 3px;
  margin-bottom: 2px;
}

.schema-editor__warning--warning {
  background: rgba(250, 179, 135, 0.1);
  color: #fab387;
  border: 1px solid rgba(250, 179, 135, 0.25);
}

.schema-editor__warning--info {
  background: rgba(137, 180, 250, 0.1);
  color: #89b4fa;
  border: 1px solid rgba(137, 180, 250, 0.25);
}

.schema-editor__add-btn--child {
  font-size: 11px;
  padding: 4px 10px;
  margin-top: 6px;
  background: none;
  border: 1px dashed #45475a;
  color: #89b4fa;
  border-radius: 5px;
  cursor: pointer;
  align-self: flex-start;
}

.schema-editor__add-btn--child:hover {
  background: rgba(137, 180, 250, 0.08);
  border-color: #89b4fa;
}
</style>
