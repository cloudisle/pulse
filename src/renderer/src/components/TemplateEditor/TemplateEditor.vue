<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useTemplateStore } from '@renderer/stores/template.store'
import type { Template, TemplateField } from '@shared/models/template'
import type { OverrideAction } from '@shared/models/profile'
import type { GenerationStrategy, StrategyType } from '@shared/models/generation'
import type { Schema, SchemaElement } from '@shared/models/schema'
import type { InputConfig } from '@shared/models/system'

const props = defineProps<{
  templateId?: string
}>()

const uiStore = useUiStore()
const systemStore = useSystemStore()
const schemaStore = useSchemaStore()
const profileStore = useProfileStore()
const templateStore = useTemplateStore()

const isEditMode = computed(() => !!props.templateId && props.templateId !== 'new')

// ─── Form state ───────────────────────────────────────────────────────────────

const templateName = ref('')
const templateDescription = ref('')
const selectedSchemaId = ref<string | null>(null)
const selectedInputId = ref<string | null>(null)
const selectedProfileIds = ref<string[]>([])
const selectedFolderId = ref<string | null>(null)
const fields = reactive<TemplateField[]>([])

// ─── UI state ─────────────────────────────────────────────────────────────────

const errorMessage = ref('')
const saving = ref(false)
const inputs = ref<InputConfig[]>([])
const schemaElements = ref<{ path: string; required: boolean }[]>([])

const STRATEGY_TYPES: StrategyType[] = [
  'random',
  'faker',
  'enum',
  'pattern',
  'range',
  'constant',
  'template'
]

// ─── Load helpers ─────────────────────────────────────────────────────────────

async function loadInputs(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return
  try {
    const system = await api.systems.get(systemId)
    inputs.value = system.inputs ?? []
  } catch {
    inputs.value = []
  }
}

function flattenElements(elements: SchemaElement[], prefix: string): { path: string; required: boolean }[] {
  const result: { path: string; required: boolean }[] = []
  for (const el of elements) {
    const path = prefix ? `${prefix}.${el.name}` : el.name
    result.push({ path, required: el.required })
    if (el.children && el.children.length > 0) {
      result.push(...flattenElements(el.children, path))
    }
  }
  return result
}

async function loadSchemaElements(): Promise<void> {
  if (!selectedSchemaId.value || !systemStore.selectedSystemId) {
    schemaElements.value = []
    return
  }
  const api = (window as any).app?.api
  if (!api) return
  try {
    const schema: Schema = await api.schemas.get(systemStore.selectedSystemId, selectedSchemaId.value)
    schemaElements.value = flattenElements(schema.elements ?? [], '')
    // Populate required fields that don't yet have a row
    for (const el of schemaElements.value) {
      if (el.required && !fields.find((f) => f.elementPath === el.path)) {
        fields.push({ elementPath: el.path, action: 'set', value: '' })
      }
    }
  } catch {
    schemaElements.value = []
  }
}

watch(selectedSchemaId, loadSchemaElements)

// ─── Load existing template ───────────────────────────────────────────────────

onMounted(async () => {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return

  await Promise.all([
    schemaStore.list(systemId),
    profileStore.list(systemId),
    templateStore.list(systemId),
    loadInputs()
  ])

  if (!isEditMode.value) return
  const api = (window as any).app?.api
  if (!api) return

  try {
    const template: Template = await api.templates.get(systemId, props.templateId)
    templateName.value = template.name ?? ''
    templateDescription.value = template.description ?? ''
    selectedSchemaId.value = template.schemaId ?? null
    selectedInputId.value = template.inputId ?? null
    selectedProfileIds.value = [...(template.profileIds ?? [])]
    selectedFolderId.value = template.folderId ?? null
    fields.push(...JSON.parse(JSON.stringify(template.fields ?? [])))
  } catch {
    errorMessage.value = 'Failed to load template.'
  }
})

// ─── Field management ─────────────────────────────────────────────────────────

function addField(): void {
  fields.push({ elementPath: '', action: 'set', value: '' })
}

function removeField(index: number): void {
  fields.splice(index, 1)
}

function onFieldActionChange(field: TemplateField, action: OverrideAction): void {
  field.action = action
  if (action === 'set') {
    field.value = ''
    delete field.generationStrategy
  } else if (action === 'generate') {
    field.generationStrategy = defaultFieldStrategy('random')
    delete field.value
  } else {
    delete field.value
    delete field.generationStrategy
  }
}

function defaultFieldStrategy(type: StrategyType = 'random'): GenerationStrategy {
  switch (type) {
    case 'faker':
      return { type: 'faker', config: { method: '', locale: '' } }
    case 'enum':
      return { type: 'enum', config: { values: [] } }
    case 'pattern':
      return { type: 'pattern', config: { pattern: '' } }
    case 'range':
      return { type: 'range', config: { min: 0, max: 100, step: 1, decimals: 0 } }
    case 'constant':
      return { type: 'constant', config: { value: '' } }
    case 'template':
      return { type: 'template', config: { template: '' } }
    default:
      return { type: 'random', config: {} }
  }
}

function onFieldStrategyTypeChange(field: TemplateField, type: StrategyType): void {
  field.generationStrategy = defaultFieldStrategy(type)
}

function addFieldEnumValue(field: TemplateField, event: KeyboardEvent): void {
  const input = event.target as HTMLInputElement
  const val = input.value.trim()
  if (!val) return
  const config = field.generationStrategy?.config as { values: any[] }
  if (config?.values) {
    config.values.push(val)
    input.value = ''
  }
}

function removeFieldEnumValue(field: TemplateField, vi: number): void {
  const config = field.generationStrategy?.config as { values: any[] }
  if (config?.values) {
    config.values.splice(vi, 1)
  }
}

// ─── Profile ordering ─────────────────────────────────────────────────────────

function toggleProfile(id: string): void {
  const idx = selectedProfileIds.value.indexOf(id)
  if (idx === -1) {
    selectedProfileIds.value.push(id)
  } else {
    selectedProfileIds.value.splice(idx, 1)
  }
}

function moveProfileUp(idx: number): void {
  if (idx === 0) return
  const arr = selectedProfileIds.value
  ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
}

function moveProfileDown(idx: number): void {
  const arr = selectedProfileIds.value
  if (idx === arr.length - 1) return
  ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save(): Promise<void> {
  if (!templateName.value.trim()) {
    errorMessage.value = 'Template name is required.'
    return
  }
  if (!selectedSchemaId.value) {
    errorMessage.value = 'A schema is required.'
    return
  }
  if (!selectedInputId.value) {
    errorMessage.value = 'A destination input is required.'
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
      systemId,
      name: templateName.value.trim(),
      description: templateDescription.value.trim() || undefined,
      schemaId: selectedSchemaId.value,
      inputId: selectedInputId.value,
      profileIds: [...selectedProfileIds.value],
      folderId: selectedFolderId.value,
      fields: JSON.parse(JSON.stringify(fields))
    }

    if (isEditMode.value) {
      await api.templates.update(systemId, props.templateId, payload)
      await templateStore.list(systemId)
      const tabId = `template:${props.templateId}`
      const tab = uiStore.openTabs.find((t) => t.id === tabId)
      if (tab) tab.title = templateName.value.trim()
    } else {
      const created: Template = await api.templates.create(payload)
      await templateStore.list(systemId)
      uiStore.closeTab('template:new')
      uiStore.openTab({ id: `template:${created.id}`, type: 'template', title: created.name })
    }
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Failed to save template.'
  } finally {
    saving.value = false
  }
}

function cancel(): void {
  if (isEditMode.value) {
    uiStore.closeTab(`template:${props.templateId}`)
  } else {
    uiStore.closeTab('template:new')
  }
}
</script>

<template>
  <div class="te">
    <!-- Header -->
    <header class="te__header">
      <div class="te__header-fields">
        <input
          v-model="templateName"
          class="te__name-input"
          type="text"
          placeholder="Template name…"
          data-testid="template-name"
        />
        <input
          v-model="templateDescription"
          class="te__desc-input"
          type="text"
          placeholder="Description (optional)…"
          data-testid="template-description"
        />
      </div>
      <div class="te__header-actions">
        <button
          class="te__btn te__btn--secondary"
          data-testid="cancel-btn"
          @click="cancel"
        >
          Cancel
        </button>
        <button
          class="te__btn te__btn--primary"
          data-testid="save-btn"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </header>

    <!-- Error -->
    <p
      v-if="errorMessage"
      class="te__error"
      data-testid="error-message"
    >
      {{ errorMessage }}
    </p>

    <div class="te__body">
      <!-- ── Configuration column ─────────────────────────────────────────── -->
      <div class="te__config">
        <!-- Schema -->
        <div class="te__field">
          <label class="te__label" for="te-schema-select">Schema</label>
          <select
            id="te-schema-select"
            class="te__select"
            data-testid="schema-select"
            :value="selectedSchemaId ?? ''"
            @change="selectedSchemaId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="" disabled>Select a schema…</option>
            <option
              v-for="schema in schemaStore.schemas"
              :key="schema.id"
              :value="schema.id"
            >
              {{ schema.name }}
            </option>
          </select>
        </div>

        <!-- Destination (input) -->
        <div class="te__field">
          <label class="te__label" for="te-input-select">Destination</label>
          <select
            id="te-input-select"
            class="te__select"
            data-testid="input-select"
            :value="selectedInputId ?? ''"
            @change="selectedInputId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="" disabled>Select a destination…</option>
            <option
              v-for="input in inputs"
              :key="input.id"
              :value="input.id"
            >
              {{ input.name }} ({{ input.type }})
            </option>
          </select>
        </div>

        <!-- Folder -->
        <div class="te__field">
          <label class="te__label" for="te-folder-select">Folder</label>
          <select
            id="te-folder-select"
            class="te__select"
            data-testid="folder-select"
            :value="selectedFolderId ?? ''"
            @change="selectedFolderId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="">Root</option>
            <option
              v-for="folder in templateStore.folders"
              :key="folder.id"
              :value="folder.id"
            >
              {{ folder.name }}
            </option>
          </select>
        </div>

        <!-- Profiles (multi-select, ordered) -->
        <div class="te__field">
          <label class="te__label">Profiles (ordered)</label>
          <div class="te__profiles" data-testid="profiles-section">
            <div
              v-if="profileStore.availableProfiles.length === 0"
              class="te__profiles-empty"
              data-testid="profiles-empty"
            >
              No profiles available
            </div>
            <div
              v-for="profile in profileStore.availableProfiles"
              :key="profile.id"
              class="te__profile-row"
              :data-testid="`profile-row-${profile.id}`"
            >
              <input
                :id="`profile-cb-${profile.id}`"
                type="checkbox"
                :checked="selectedProfileIds.includes(profile.id)"
                :data-testid="`profile-checkbox-${profile.id}`"
                @change="toggleProfile(profile.id)"
              />
              <label :for="`profile-cb-${profile.id}`" class="te__profile-label">
                {{ profile.name }}
              </label>
            </div>
            <!-- Order controls for selected profiles -->
            <div
              v-if="selectedProfileIds.length > 0"
              class="te__profile-order"
              data-testid="profile-order"
            >
              <p class="te__profile-order-label">Order:</p>
              <div
                v-for="(pid, idx) in selectedProfileIds"
                :key="pid"
                class="te__profile-order-row"
                :data-testid="`profile-order-${idx}`"
              >
                <span class="te__profile-order-name">
                  {{ profileStore.availableProfiles.find((p) => p.id === pid)?.name ?? pid }}
                </span>
                <div class="te__profile-order-btns">
                  <button
                    class="te__order-btn"
                    :disabled="idx === 0"
                    :data-testid="`profile-up-${idx}`"
                    @click="moveProfileUp(idx)"
                  >
                    ▲
                  </button>
                  <button
                    class="te__order-btn"
                    :disabled="idx === selectedProfileIds.length - 1"
                    :data-testid="`profile-down-${idx}`"
                    @click="moveProfileDown(idx)"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Fields table ─────────────────────────────────────────────────── -->
      <div class="te__fields-section">
        <div class="te__fields-header">
          <h3 class="te__section-title">Preset Fields</h3>
          <button
            class="te__btn te__btn--ghost"
            data-testid="add-field-btn"
            @click="addField"
          >
            + Add Field
          </button>
        </div>

        <div
          v-if="fields.length === 0"
          class="te__fields-empty"
          data-testid="fields-empty"
        >
          No fields defined. Fields from the selected schema will appear automatically.
        </div>

        <div
          v-else
          class="te__fields-list"
          data-testid="fields-table"
        >
          <div
            v-for="(field, idx) in fields"
            :key="idx"
            class="te__field-block"
            :data-testid="`field-row-${idx}`"
          >
            <!-- Path + Action row -->
            <div class="te__field-path-row">
              <input
                class="te__input te__input--path"
                :value="field.elementPath"
                placeholder="element.path"
                :list="`field-path-suggestions-${idx}`"
                :data-testid="`field-path-${idx}`"
                @input="field.elementPath = ($event.target as HTMLInputElement).value"
              />
              <datalist :id="`field-path-suggestions-${idx}`">
                <option v-for="el in schemaElements" :key="el.path" :value="el.path" />
              </datalist>
              <select
                class="te__action-select"
                :class="`te__action--${field.action}`"
                :value="field.action"
                :data-testid="`field-action-${idx}`"
                @change="onFieldActionChange(field, ($event.target as HTMLSelectElement).value as OverrideAction)"
              >
                <option value="set">set</option>
                <option value="generate">generate</option>
                <option value="omit">omit</option>
                <option value="require">require</option>
                <option value="nullify">nullify</option>
              </select>
              <button
                class="te__btn te__btn--ghost te__btn--danger"
                :data-testid="`field-remove-${idx}`"
                @click="removeField(idx)"
              >
                ×
              </button>
            </div>

            <!-- Value / Config -->
            <div class="te__field-config">
              <!-- set -->
              <template v-if="field.action === 'set'">
                <input
                  v-model="field.value"
                  class="te__input"
                  type="text"
                  placeholder='Value (e.g. "active", 42, true)'
                  :data-testid="`field-value-${idx}`"
                />
              </template>

              <!-- generate -->
              <template v-else-if="field.action === 'generate'">
                <div class="te__strategy">
                  <select
                    class="te__strategy-select"
                    :value="field.generationStrategy?.type ?? 'random'"
                    :data-testid="`field-strategy-type-${idx}`"
                    @change="onFieldStrategyTypeChange(field, ($event.target as HTMLSelectElement).value as StrategyType)"
                  >
                    <option v-for="st in STRATEGY_TYPES" :key="st" :value="st">{{ st }}</option>
                  </select>

                  <!-- faker -->
                  <template v-if="field.generationStrategy?.type === 'faker'">
                    <input
                      v-model="(field.generationStrategy.config as any).method"
                      class="te__strategy-input"
                      type="text"
                      placeholder="faker method (e.g. person.firstName)"
                      :data-testid="`field-faker-method-${idx}`"
                    />
                    <input
                      v-model="(field.generationStrategy.config as any).locale"
                      class="te__strategy-input"
                      type="text"
                      placeholder="locale (optional)"
                      :data-testid="`field-faker-locale-${idx}`"
                    />
                  </template>

                  <!-- enum -->
                  <template v-else-if="field.generationStrategy?.type === 'enum'">
                    <div class="te__enum-values">
                      <span
                        v-for="(val, vi) in (field.generationStrategy.config as any).values"
                        :key="vi"
                        class="te__enum-chip"
                      >
                        {{ val }}
                        <button
                          class="te__enum-remove"
                          :data-testid="`field-enum-remove-${idx}-${vi}`"
                          @click="removeFieldEnumValue(field, vi)"
                        >✕</button>
                      </span>
                      <input
                        class="te__strategy-input"
                        type="text"
                        placeholder="Add value + Enter"
                        :data-testid="`field-enum-input-${idx}`"
                        @keydown.enter="addFieldEnumValue(field, $event)"
                      />
                    </div>
                  </template>

                  <!-- pattern -->
                  <template v-else-if="field.generationStrategy?.type === 'pattern'">
                    <input
                      v-model="(field.generationStrategy.config as any).pattern"
                      class="te__strategy-input"
                      type="text"
                      placeholder="regex pattern"
                      :data-testid="`field-pattern-${idx}`"
                    />
                  </template>

                  <!-- range -->
                  <template v-else-if="field.generationStrategy?.type === 'range'">
                    <input
                      v-model.number="(field.generationStrategy.config as any).min"
                      class="te__strategy-input te__strategy-input--sm"
                      type="number"
                      placeholder="min"
                      :data-testid="`field-range-min-${idx}`"
                    />
                    <input
                      v-model.number="(field.generationStrategy.config as any).max"
                      class="te__strategy-input te__strategy-input--sm"
                      type="number"
                      placeholder="max"
                      :data-testid="`field-range-max-${idx}`"
                    />
                  </template>

                  <!-- constant -->
                  <template v-else-if="field.generationStrategy?.type === 'constant'">
                    <input
                      v-model="(field.generationStrategy.config as any).value"
                      class="te__strategy-input"
                      type="text"
                      placeholder="constant value"
                      :data-testid="`field-constant-${idx}`"
                    />
                  </template>

                  <!-- template -->
                  <template v-else-if="field.generationStrategy?.type === 'template'">
                    <input
                      v-model="(field.generationStrategy.config as any).template"
                      class="te__strategy-input"
                      type="text"
                      placeholder="template string"
                      :data-testid="`field-template-string-${idx}`"
                    />
                  </template>
                </div>
              </template>

              <!-- omit -->
              <template v-else-if="field.action === 'omit'">
                <span class="te__hint">(field excluded from generated event)</span>
              </template>

              <!-- require -->
              <template v-else-if="field.action === 'require'">
                <span class="te__hint">(forces inclusion of optional field)</span>
              </template>

              <!-- nullify -->
              <template v-else-if="field.action === 'nullify'">
                <span class="te__hint">(field set to null)</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.te {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #cdd6f4;
  font-size: 13px;
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.te__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.te__header-fields {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.te__name-input {
  font-size: 18px;
  font-weight: 700;
  background: transparent;
  border: none;
  border-bottom: 1px solid #313244;
  color: #cdd6f4;
  padding: 2px 0;
  outline: none;
  width: 100%;
}

.te__name-input:focus {
  border-bottom-color: #89b4fa;
}

.te__desc-input {
  font-size: 13px;
  background: transparent;
  border: none;
  border-bottom: 1px solid #313244;
  color: #a6adc8;
  padding: 2px 0;
  outline: none;
  width: 100%;
}

.te__desc-input:focus {
  border-bottom-color: #89b4fa;
}

.te__header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: flex-start;
  padding-top: 4px;
}

/* ── Error ───────────────────────────────────────────────────────────────── */

.te__error {
  color: #f38ba8;
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: #2a1520;
  border: 1px solid #f38ba844;
  border-radius: 4px;
}

/* ── Body ────────────────────────────────────────────────────────────────── */

.te__body {
  flex: 1;
  display: flex;
  gap: 24px;
  margin-top: 20px;
  overflow: hidden;
}

/* ── Config column ───────────────────────────────────────────────────────── */

.te__config {
  width: 280px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.te__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.te__label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #585b70;
}

.te__select {
  padding: 6px 8px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.te__select:focus {
  border-color: #89b4fa;
}

/* ── Profiles ────────────────────────────────────────────────────────────── */

.te__profiles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.te__profiles-empty {
  font-size: 12px;
  color: #585b70;
  font-style: italic;
}

.te__profile-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.te__profile-label {
  cursor: pointer;
}

.te__profile-order {
  margin-top: 8px;
  padding: 8px;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 4px;
}

.te__profile-order-label {
  font-size: 11px;
  color: #585b70;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 6px;
}

.te__profile-order-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 0;
}

.te__profile-order-name {
  font-size: 12px;
  color: #cdd6f4;
}

.te__profile-order-btns {
  display: flex;
  gap: 2px;
}

.te__order-btn {
  background: none;
  border: none;
  color: #585b70;
  font-size: 10px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}

.te__order-btn:hover:not(:disabled) {
  background: #313244;
  color: #cdd6f4;
}

.te__order-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* ── Fields section ──────────────────────────────────────────────────────── */

.te__fields-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.te__fields-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.te__section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #585b70;
  margin: 0;
}

.te__fields-empty {
  font-size: 12px;
  color: #45475a;
  font-style: italic;
  padding: 12px 0;
}

.te__fields-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  overflow-y: auto;
}

.te__th {
  text-align: left;
  padding: 6px 8px;
  background: #181825;
  color: #585b70;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #313244;
  position: sticky;
  top: 0;
}

.te__th--center {
  text-align: center;
}

.te__td {
  padding: 4px 6px;
  border-bottom: 1px solid #1e1e2e;
  vertical-align: middle;
}

.te__td--center {
  text-align: center;
}

.te__input {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 6px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 3px;
  font-size: 12px;
  outline: none;
}

.te__input:focus {
  border-color: #89b4fa;
}

.te__input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.te__input--path {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  color: #89b4fa;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

.te__btn {
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s ease;
  white-space: nowrap;
}

.te__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.te__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.te__btn--primary:hover:not(:disabled) {
  background: #b4befe;
  border-color: #b4befe;
}

.te__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.te__btn--secondary:hover:not(:disabled) {
  background: #45475a;
}

.te__btn--ghost {
  background: transparent;
  color: #a6adc8;
  border-color: transparent;
  padding: 3px 8px;
  font-size: 12px;
}

.te__btn--ghost:hover:not(:disabled) {
  background: #313244;
  color: #cdd6f4;
}

.te__btn--danger {
  color: #f38ba8;
}

.te__btn--danger:hover:not(:disabled) {
  background: #2a1520;
  color: #f38ba8;
}

/* ── Field blocks ────────────────────────────────────────────────────────── */

.te__fields-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1;
}

.te__field-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 4px;
}

.te__field-path-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.te__field-config {
  padding-left: 2px;
}

.te__action-select {
  padding: 4px 6px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  outline: none;
  flex-shrink: 0;
}

.te__action-select:focus {
  border-color: #89b4fa;
}

.te__action--set { color: #a6e3a1; }
.te__action--generate { color: #89b4fa; }
.te__action--omit { color: #f38ba8; }
.te__action--require { color: #fab387; }
.te__action--nullify { color: #cba6f7; }

.te__strategy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.te__strategy-select {
  padding: 4px 6px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  outline: none;
}

.te__strategy-input {
  padding: 4px 8px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 11px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.te__strategy-input:focus {
  border-color: #89b4fa;
}

.te__strategy-input--sm {
  width: 80px;
  flex: none;
}

.te__enum-values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.te__enum-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 10px;
  font-size: 11px;
  color: #cdd6f4;
}

.te__enum-remove {
  background: none;
  border: none;
  color: #585b70;
  cursor: pointer;
  padding: 0;
  font-size: 10px;
  line-height: 1;
}

.te__enum-remove:hover {
  color: #f38ba8;
}

.te__hint {
  font-size: 11px;
  color: #585b70;
  font-style: italic;
}
</style>
