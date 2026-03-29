<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import type { BuiltInType, SchemaConstraints } from '../../../../../shared/models/schema'
import type { StrategyType } from '../../../../../shared/models/generation'

const props = defineProps<{
  customTypeId?: string
}>()

const uiStore = useUiStore()
const systemStore = useSystemStore()

const isEditMode = computed(() => !!props.customTypeId && props.customTypeId !== 'new')

const name = ref('')
const baseType = ref<BuiltInType>('string')
const strategyType = ref<StrategyType>('random')
const strategyConfig = reactive<Record<string, any>>({})
const constraints = reactive<SchemaConstraints>({})
const constraintsExpanded = ref(false)
const enumInput = ref('')
const enumValues = ref<any[]>([])

const errorMessage = ref('')
const saving = ref(false)
const deleting = ref(false)

const BUILT_IN_TYPES: BuiltInType[] = ['string', 'integer', 'number', 'boolean', 'object', 'array', 'null']
const STRATEGY_TYPES: StrategyType[] = ['random', 'faker', 'enum', 'pattern', 'range', 'constant', 'template']

function defaultStrategyConfig(type: StrategyType): Record<string, any> {
  switch (type) {
    case 'faker': return { method: '', locale: '' }
    case 'enum': return { values: [] }
    case 'pattern': return { pattern: '' }
    case 'range': return { min: 0, max: 100, step: 1, decimals: 0 }
    case 'constant': return { value: '' }
    case 'template': return { template: '' }
    default: return {}
  }
}

function applyStrategyConfig(config: Record<string, any>): void {
  Object.keys(strategyConfig).forEach((k) => delete strategyConfig[k])
  Object.assign(strategyConfig, config)
  if (strategyType.value === 'enum') {
    enumValues.value = Array.isArray(config.values) ? [...config.values] : []
  }
}

function onStrategyTypeChange(event: Event): void {
  const type = (event.target as HTMLSelectElement).value as StrategyType
  strategyType.value = type
  applyStrategyConfig(defaultStrategyConfig(type))
}

function addEnumValue(): void {
  const val = enumInput.value.trim()
  if (!val) return
  enumValues.value.push(val)
  enumInput.value = ''
}

function addEnumByKey(event: KeyboardEvent): void {
  if (event.key === 'Enter') addEnumValue()
}

function removeEnumValue(index: number): void {
  enumValues.value.splice(index, 1)
}

function buildGenerationStrategy(): { type: StrategyType; config: Record<string, any> } {
  if (strategyType.value === 'enum') {
    return { type: 'enum', config: { values: [...enumValues.value] } }
  }
  return { type: strategyType.value, config: { ...strategyConfig } }
}

onMounted(async () => {
  if (!isEditMode.value) {
    applyStrategyConfig(defaultStrategyConfig('random'))
    return
  }
  const api = (window as any).app?.api
  if (!api || !systemStore.selectedSystemId) return
  try {
    const ct = await api.customTypes.get(systemStore.selectedSystemId, props.customTypeId)
    name.value = ct.name ?? ''
    baseType.value = ct.baseType ?? 'string'
    strategyType.value = ct.defaultStrategy?.type ?? 'random'
    applyStrategyConfig(ct.defaultStrategy?.config ?? defaultStrategyConfig(strategyType.value))
    if (ct.constraints) {
      Object.assign(constraints, ct.constraints)
    }
  } catch {
    errorMessage.value = 'Failed to load custom type.'
  }
})

async function save(): Promise<void> {
  if (!name.value.trim()) {
    errorMessage.value = 'Name is required.'
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
      name: name.value.trim(),
      baseType: baseType.value,
      defaultStrategy: buildGenerationStrategy(),
      constraints: { ...constraints }
    }
    if (isEditMode.value) {
      await api.customTypes.update(systemId, props.customTypeId, payload)
      const tabId = `custom-type:${props.customTypeId}`
      const tab = uiStore.openTabs.find((t) => t.id === tabId)
      if (tab) tab.title = name.value.trim()
    } else {
      const created = await api.customTypes.create({ systemId, ...payload })
      uiStore.closeTab('custom-type:new')
      uiStore.openTab({ id: `custom-type:${created.id}`, type: 'custom-type', title: created.name })
    }
  } catch {
    errorMessage.value = 'Failed to save custom type.'
  } finally {
    saving.value = false
  }
}

async function deleteType(): Promise<void> {
  const api = (window as any).app?.api
  if (!api || !systemStore.selectedSystemId) return
  let warningMessage = `Delete custom type "${name.value}"? This action cannot be undone.`
  try {
    const refs = await api.customTypes.findReferences?.(systemStore.selectedSystemId, props.customTypeId)
    if (refs && refs.length > 0) {
      warningMessage = `Custom type "${name.value}" is referenced by ${refs.length} schema(s). Deleting it may break those schemas.\n\n${warningMessage}`
    }
  } catch {
    // findReferences is optional; proceed without it
  }
  if (!confirm(warningMessage)) return
  deleting.value = true
  try {
    const result = await api.customTypes.delete(systemStore.selectedSystemId, props.customTypeId)
    if (result?.warnings?.length) {
      // warnings were already shown via the confirm prompt above
    }
    uiStore.closeTab(`custom-type:${props.customTypeId}`)
  } catch {
    errorMessage.value = 'Failed to delete custom type.'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="custom-type-editor">
    <header class="custom-type-editor__header">
      <h2 class="custom-type-editor__title">
        {{ isEditMode ? 'Edit Custom Type' : 'New Custom Type' }}
      </h2>
      <div class="custom-type-editor__actions">
        <button
          class="custom-type-editor__btn custom-type-editor__btn--primary"
          :disabled="saving"
          data-testid="save-btn"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          v-if="isEditMode"
          class="custom-type-editor__btn custom-type-editor__btn--danger"
          :disabled="deleting"
          data-testid="delete-btn"
          @click="deleteType"
        >
          {{ deleting ? 'Deleting…' : 'Delete' }}
        </button>
      </div>
    </header>

    <p v-if="errorMessage" class="custom-type-editor__error" role="alert" data-testid="error-message">
      {{ errorMessage }}
    </p>

    <!-- Name -->
    <section class="custom-type-editor__section">
      <div class="custom-type-editor__field">
        <label class="custom-type-editor__label" for="ct-name">Name</label>
        <input
          id="ct-name"
          v-model="name"
          class="custom-type-editor__input"
          type="text"
          placeholder="e.g. PhoneNumber"
          data-testid="custom-type-name"
        />
      </div>

      <!-- Base type -->
      <div class="custom-type-editor__field">
        <label class="custom-type-editor__label" for="ct-base-type">Base Type</label>
        <select
          id="ct-base-type"
          v-model="baseType"
          class="custom-type-editor__select"
          data-testid="custom-type-base-type"
        >
          <option v-for="t in BUILT_IN_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
    </section>

    <!-- Default Generation Strategy -->
    <section class="custom-type-editor__section">
      <h3 class="custom-type-editor__section-title">Default Generation Strategy</h3>

      <div class="custom-type-editor__field">
        <label class="custom-type-editor__label">Strategy</label>
        <select
          class="custom-type-editor__select"
          :value="strategyType"
          data-testid="custom-type-strategy"
          @change="onStrategyTypeChange"
        >
          <option v-for="s in STRATEGY_TYPES" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>

      <!-- faker -->
      <template v-if="strategyType === 'faker'">
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Method</label>
          <input
            v-model="strategyConfig.method"
            class="custom-type-editor__input"
            type="text"
            placeholder="e.g. person.firstName"
            data-testid="faker-method"
          />
        </div>
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Locale</label>
          <input
            v-model="strategyConfig.locale"
            class="custom-type-editor__input"
            type="text"
            placeholder="e.g. en"
            data-testid="faker-locale"
          />
        </div>
      </template>

      <!-- enum -->
      <template v-else-if="strategyType === 'enum'">
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Values</label>
          <div class="custom-type-editor__enum-tags" data-testid="enum-tags">
            <span
              v-for="(val, vi) in enumValues"
              :key="vi"
              class="custom-type-editor__enum-tag"
            >
              {{ val }}
              <button
                class="custom-type-editor__enum-tag-remove"
                data-testid="enum-tag-remove"
                @click="removeEnumValue(vi)"
              >×</button>
            </span>
            <input
              v-model="enumInput"
              class="custom-type-editor__input custom-type-editor__enum-input"
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
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Pattern</label>
          <input
            v-model="strategyConfig.pattern"
            class="custom-type-editor__input"
            type="text"
            placeholder='e.g. [A-Z]{3}-\d{4}'
            data-testid="pattern-input"
          />
        </div>
      </template>

      <!-- range -->
      <template v-else-if="strategyType === 'range'">
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Min</label>
          <input v-model.number="strategyConfig.min" class="custom-type-editor__input" type="number" data-testid="range-min" />
        </div>
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Max</label>
          <input v-model.number="strategyConfig.max" class="custom-type-editor__input" type="number" data-testid="range-max" />
        </div>
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Step</label>
          <input v-model.number="strategyConfig.step" class="custom-type-editor__input" type="number" data-testid="range-step" />
        </div>
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Decimals</label>
          <input v-model.number="strategyConfig.decimals" class="custom-type-editor__input" type="number" data-testid="range-decimals" />
        </div>
      </template>

      <!-- constant -->
      <template v-else-if="strategyType === 'constant'">
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Value</label>
          <input
            v-model="strategyConfig.value"
            class="custom-type-editor__input"
            type="text"
            placeholder="Constant value"
            data-testid="constant-value"
          />
        </div>
      </template>

      <!-- template -->
      <template v-else-if="strategyType === 'template'">
        <div class="custom-type-editor__field">
          <label class="custom-type-editor__label">Template</label>
          <input
            v-model="strategyConfig.template"
            class="custom-type-editor__input"
            type="text"
            placeholder="e.g. ORD-{{ uuid }}"
            data-testid="template-input"
          />
        </div>
      </template>

      <!-- random: no config needed -->
    </section>

    <!-- Constraints -->
    <section class="custom-type-editor__section">
      <button
        class="custom-type-editor__constraints-toggle"
        data-testid="constraints-toggle"
        @click="constraintsExpanded = !constraintsExpanded"
      >
        {{ constraintsExpanded ? '▾' : '▸' }} Constraints
      </button>
      <div v-if="constraintsExpanded" class="custom-type-editor__constraints-body" data-testid="constraints-body">
        <div class="custom-type-editor__field custom-type-editor__field--inline">
          <label class="custom-type-editor__label">minLength</label>
          <input
            v-model.number="constraints.minLength"
            class="custom-type-editor__input"
            type="number"
            placeholder="—"
            data-testid="constraint-minLength"
          />
        </div>
        <div class="custom-type-editor__field custom-type-editor__field--inline">
          <label class="custom-type-editor__label">maxLength</label>
          <input
            v-model.number="constraints.maxLength"
            class="custom-type-editor__input"
            type="number"
            placeholder="—"
            data-testid="constraint-maxLength"
          />
        </div>
        <div class="custom-type-editor__field custom-type-editor__field--inline">
          <label class="custom-type-editor__label">Pattern</label>
          <input
            v-model="constraints.pattern"
            class="custom-type-editor__input"
            type="text"
            placeholder="—"
            data-testid="constraint-pattern"
          />
        </div>
        <div class="custom-type-editor__field custom-type-editor__field--inline">
          <label class="custom-type-editor__label">Format</label>
          <input
            v-model="constraints.format"
            class="custom-type-editor__input"
            type="text"
            placeholder="e.g. date-time"
            data-testid="constraint-format"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.custom-type-editor {
  padding: 24px;
  max-width: 700px;
  color: #cdd6f4;
}

.custom-type-editor__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.custom-type-editor__title {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  flex: 1;
  color: #cdd6f4;
}

.custom-type-editor__actions {
  display: flex;
  gap: 8px;
}

.custom-type-editor__btn {
  padding: 6px 14px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.custom-type-editor__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.custom-type-editor__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.custom-type-editor__btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.custom-type-editor__btn--danger {
  background: #f38ba8;
  color: #1e1e2e;
}

.custom-type-editor__btn--danger:hover:not(:disabled) {
  background: #eba0ac;
}

.custom-type-editor__error {
  color: #f38ba8;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: 5px;
  border: 1px solid rgba(243, 139, 168, 0.3);
}

.custom-type-editor__section {
  margin-bottom: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-start;
}

.custom-type-editor__section-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #89b4fa;
  margin: 0 0 4px;
  width: 100%;
}

.custom-type-editor__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 180px;
  flex: 1;
}

.custom-type-editor__field--inline {
  min-width: 140px;
  flex: 0 1 160px;
}

.custom-type-editor__label {
  font-size: 11px;
  font-weight: 500;
  color: #a6adc8;
}

.custom-type-editor__input,
.custom-type-editor__select {
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

.custom-type-editor__input:focus,
.custom-type-editor__select:focus {
  border-color: #89b4fa;
}

.custom-type-editor__enum-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.custom-type-editor__enum-tag {
  background: #313244;
  color: #cdd6f4;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.custom-type-editor__enum-tag-remove {
  background: none;
  border: none;
  color: #f38ba8;
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  line-height: 1;
}

.custom-type-editor__enum-input {
  flex: 1;
  min-width: 160px;
  width: auto;
}

.custom-type-editor__constraints-toggle {
  background: none;
  border: none;
  color: #6c7086;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
  width: 100%;
  text-align: left;
}

.custom-type-editor__constraints-toggle:hover {
  color: #a6adc8;
}

.custom-type-editor__constraints-body {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  padding: 12px;
  background: #181825;
  border-radius: 5px;
  border: 1px solid #313244;
  width: 100%;
}
</style>
