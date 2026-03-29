<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import type { Profile, ProfileOverride, OverrideAction } from '../../../../../shared/models/profile'
import type { GenerationStrategy, StrategyType } from '../../../../../shared/models/generation'
import type { Schema, SchemaElement } from '../../../../../shared/models/schema'

const props = defineProps<{
  profileId?: string
}>()

const uiStore = useUiStore()
const systemStore = useSystemStore()
const schemaStore = useSchemaStore()
const profileStore = useProfileStore()

const isEditMode = computed(() => !!props.profileId && props.profileId !== 'new')

// Form state
const profileName = ref('')
const profileDescription = ref('')
const selectedSchemaId = ref<string | null>(null)
const overrides = reactive<ProfileOverride[]>([])

// UI state
const errorMessage = ref('')
const saving = ref(false)
const deleting = ref(false)
const generating = ref(false)
const samplePayload = ref<string | null>(null)

// Schema elements for autocomplete and preview
const schemaElements = ref<string[]>([])

const STRATEGY_TYPES: StrategyType[] = [
  'random',
  'faker',
  'enum',
  'pattern',
  'range',
  'constant',
  'template'
]

// ─── Available schemas ───────────────────────────────────────────────────────

async function loadAvailableSchemas(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  await schemaStore.list(systemId)
}

watch(() => systemStore.selectedSystemId, loadAvailableSchemas)

// ─── Schema element paths ────────────────────────────────────────────────────

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

async function loadSchemaElements(): Promise<void> {
  if (!selectedSchemaId.value || !systemStore.selectedSystemId) {
    schemaElements.value = []
    return
  }
  const api = (window as any).app?.api
  if (!api) return
  try {
    const schema: Schema = await api.schemas.get(
      systemStore.selectedSystemId,
      selectedSchemaId.value
    )
    schemaElements.value = flattenElementPaths(schema.elements ?? [], '')
  } catch {
    schemaElements.value = []
  }
}

watch(selectedSchemaId, loadSchemaElements)

// ─── Load existing profile ───────────────────────────────────────────────────

onMounted(async () => {
  await loadAvailableSchemas()
  if (!isEditMode.value) return
  const api = (window as any).app?.api
  if (!api || !systemStore.selectedSystemId) return
  try {
    const profile: Profile = await api.profiles.get(
      systemStore.selectedSystemId,
      props.profileId
    )
    profileName.value = profile.name ?? ''
    profileDescription.value = profile.description ?? ''
    overrides.push(...JSON.parse(JSON.stringify(profile.overrides ?? [])))
  } catch {
    errorMessage.value = 'Failed to load profile.'
  }
})

// ─── Override management ─────────────────────────────────────────────────────

function addOverride(): void {
  overrides.push({ elementPath: '', action: 'set', value: '' })
}

function removeOverride(index: number): void {
  overrides.splice(index, 1)
}

function onActionChange(override: ProfileOverride, action: OverrideAction): void {
  override.action = action
  if (action === 'set') {
    override.value = ''
    delete override.generationStrategy
  } else if (action === 'generate') {
    override.generationStrategy = defaultStrategy('random')
    delete override.value
  } else {
    delete override.value
    delete override.generationStrategy
  }
}

// ─── Generation strategy helpers ─────────────────────────────────────────────

function defaultStrategy(type: StrategyType = 'random'): GenerationStrategy {
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

function onStrategyTypeChange(override: ProfileOverride, type: StrategyType): void {
  override.generationStrategy = defaultStrategy(type)
}

function addEnumValue(override: ProfileOverride, event: KeyboardEvent): void {
  const input = event.target as HTMLInputElement
  const val = input.value.trim()
  if (!val) return
  const config = override.generationStrategy?.config as { values: any[] }
  if (config?.values) {
    config.values.push(val)
    input.value = ''
  }
}

function removeEnumValue(override: ProfileOverride, vi: number): void {
  const config = override.generationStrategy?.config as { values: any[] }
  if (config?.values) {
    config.values.splice(vi, 1)
  }
}

// ─── Preview helpers ─────────────────────────────────────────────────────────

function getOverrideForPath(path: string): ProfileOverride | undefined {
  return overrides.find((o) => o.elementPath === path)
}

function getOverrideClass(path: string): string {
  const o = getOverrideForPath(path)
  if (!o) return ''
  const classes: Record<OverrideAction, string> = {
    set: 'profile-editor__field--set',
    generate: 'profile-editor__field--generate',
    omit: 'profile-editor__field--omit',
    require: 'profile-editor__field--require',
    nullify: 'profile-editor__field--nullify'
  }
  return classes[o.action] ?? ''
}

// ─── Save ────────────────────────────────────────────────────────────────────

async function save(): Promise<void> {
  if (!profileName.value.trim()) {
    errorMessage.value = 'Profile name is required.'
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
    const systemId = systemStore.selectedSystemId
    if (!systemId) throw new Error('No system selected')
    const payload = {
      name: profileName.value.trim(),
      description: profileDescription.value.trim(),
      overrides: JSON.parse(JSON.stringify(overrides))
    }
    if (isEditMode.value) {
      await api.profiles.update(systemId, props.profileId, payload)
      await profileStore.list(systemId)
      const tabId = `profile:${props.profileId}`
      const tab = uiStore.openTabs.find((t) => t.id === tabId)
      if (tab) tab.title = profileName.value.trim()
    } else {
      const created: Profile = await api.profiles.create({ systemId, ...payload })
      await profileStore.list(systemId)
      uiStore.closeTab('profile:new')
      uiStore.openTab({ id: `profile:${created.id}`, type: 'profile', title: created.name })
    }
  } catch {
    errorMessage.value = 'Failed to save profile.'
  } finally {
    saving.value = false
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

async function deleteProfile(): Promise<void> {
  if (!isEditMode.value) return
  const api = (window as any).app?.api
  if (!api) return

  // Check if any templates reference this profile
  let warningText = 'Are you sure you want to delete this profile? This action cannot be undone.'
  try {
    const systemId = systemStore.selectedSystemId
    if (systemId) {
      const templates = await api.templates?.list(systemId)
      const referencingTemplates = (templates ?? []).filter((t: any) =>
        t.profileIds?.includes(props.profileId)
      )
      if (referencingTemplates.length > 0) {
        const names = referencingTemplates.map((t: any) => t.name).join(', ')
        warningText = `Warning: ${referencingTemplates.length} template(s) reference this profile (${names}). Deleting it may affect those templates. Continue?`
      }
    }
  } catch {
    // Ignore errors checking templates — proceed with standard confirmation
  }

  if (!confirm(warningText)) return

  deleting.value = true
  errorMessage.value = ''
  try {
    const systemId = systemStore.selectedSystemId
    if (!systemId) throw new Error('No system selected')
    await api.profiles.delete(systemId, props.profileId)
    await profileStore.list(systemId)
    uiStore.closeTab(`profile:${props.profileId}`)
  } catch {
    errorMessage.value = 'Failed to delete profile.'
  } finally {
    deleting.value = false
  }
}

// ─── Generate Sample ─────────────────────────────────────────────────────────

function buildSetOverridesMap(): Record<string, any> {
  const map: Record<string, any> = {}
  for (const o of overrides) {
    if (o.elementPath && o.action === 'set' && o.value !== undefined) {
      map[o.elementPath] = o.value
    }
  }
  return map
}

async function generateSample(): Promise<void> {
  if (!selectedSchemaId.value) {
    errorMessage.value = 'Select a schema context to generate a sample.'
    return
  }
  const api = (window as any).app?.api
  if (!api) return
  generating.value = true
  samplePayload.value = null
  errorMessage.value = ''
  try {
    const systemId = systemStore.selectedSystemId
    if (!systemId) throw new Error('No system selected')
    // In edit mode use the saved profileId; in create mode apply set-action overrides directly
    const profileIds = isEditMode.value && props.profileId ? [props.profileId] : []
    const overridesMap = isEditMode.value ? {} : buildSetOverridesMap()
    const event = await api.events.generate(systemId, {
      schemaId: selectedSchemaId.value,
      profileIds,
      overrides: overridesMap
    })
    samplePayload.value = JSON.stringify(event.payload, null, 2)
  } catch {
    errorMessage.value = 'Failed to generate sample.'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="profile-editor">
    <!-- Header -->
    <header class="profile-editor__header">
      <div class="profile-editor__header-fields">
        <input
          v-model="profileName"
          class="profile-editor__name-input"
          type="text"
          placeholder="Profile name…"
          data-testid="profile-name"
        />
        <input
          v-model="profileDescription"
          class="profile-editor__desc-input"
          type="text"
          placeholder="Description (optional)…"
          data-testid="profile-description"
        />
        <div class="profile-editor__schema-row">
          <label class="profile-editor__label" for="schema-context-select">
            Schema context (for path autocomplete):
          </label>
          <select
            id="schema-context-select"
            class="profile-editor__select"
            data-testid="schema-context-select"
            :value="selectedSchemaId ?? ''"
            @change="selectedSchemaId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="">— None —</option>
            <option v-for="schema in schemaStore.schemas" :key="schema.id" :value="schema.id">
              {{ schema.name }}
            </option>
          </select>
        </div>
      </div>
      <div class="profile-editor__header-actions">
        <button
          v-if="isEditMode"
          class="profile-editor__btn profile-editor__btn--danger"
          :disabled="deleting"
          data-testid="delete-btn"
          @click="deleteProfile"
        >
          {{ deleting ? 'Deleting…' : 'Delete Profile' }}
        </button>
        <button
          class="profile-editor__btn profile-editor__btn--primary"
          :disabled="saving"
          data-testid="save-btn"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save Profile' }}
        </button>
      </div>
    </header>

    <!-- Error message -->
    <p
      v-if="errorMessage"
      class="profile-editor__error"
      role="alert"
      data-testid="error-message"
    >
      {{ errorMessage }}
    </p>

    <!-- Overrides section -->
    <section class="profile-editor__overrides-section">
      <div class="profile-editor__overrides-header">
        <h3 class="profile-editor__section-title">Overrides</h3>
        <button
          class="profile-editor__btn profile-editor__btn--secondary"
          data-testid="add-override-btn"
          @click="addOverride"
        >
          + Add Override
        </button>
      </div>

      <div
        v-if="overrides.length === 0"
        class="profile-editor__overrides-empty"
        data-testid="overrides-empty"
      >
        No overrides yet. Click "+ Add Override" to add one.
      </div>

      <div v-else class="profile-editor__overrides-table">
        <div class="profile-editor__overrides-thead">
          <span class="profile-editor__col-path">Element Path</span>
          <span class="profile-editor__col-action">Action</span>
          <span class="profile-editor__col-value">Value / Config</span>
          <span class="profile-editor__col-del" />
        </div>

        <div
          v-for="(override, idx) in overrides"
          :key="idx"
          class="profile-editor__override-row"
          :data-testid="`override-row-${idx}`"
        >
          <!-- Element path -->
          <div class="profile-editor__col-path">
            <input
              v-model="override.elementPath"
              class="profile-editor__path-input"
              type="text"
              placeholder="e.g. payload.status"
              :list="`path-suggestions-${idx}`"
              :data-testid="`override-path-${idx}`"
            />
            <datalist :id="`path-suggestions-${idx}`">
              <option v-for="p in schemaElements" :key="p" :value="p" />
            </datalist>
          </div>

          <!-- Action -->
          <div class="profile-editor__col-action">
            <select
              class="profile-editor__action-select"
              :class="`profile-editor__action--${override.action}`"
              :value="override.action"
              :data-testid="`override-action-${idx}`"
              @change="
                onActionChange(override, ($event.target as HTMLSelectElement).value as OverrideAction)
              "
            >
              <option value="set">set</option>
              <option value="generate">generate</option>
              <option value="omit">omit</option>
              <option value="require">require</option>
              <option value="nullify">nullify</option>
            </select>
          </div>

          <!-- Value / Config -->
          <div class="profile-editor__col-value">
            <!-- set: value input -->
            <template v-if="override.action === 'set'">
              <input
                v-model="override.value"
                class="profile-editor__value-input"
                type="text"
                placeholder='Value (e.g. "active", 42, true)'
                :data-testid="`override-value-${idx}`"
              />
            </template>

            <!-- generate: strategy config -->
            <template v-else-if="override.action === 'generate'">
              <div class="profile-editor__strategy">
                <select
                  class="profile-editor__strategy-select"
                  :value="override.generationStrategy?.type ?? 'random'"
                  :data-testid="`override-strategy-type-${idx}`"
                  @change="
                    onStrategyTypeChange(
                      override,
                      ($event.target as HTMLSelectElement).value as StrategyType
                    )
                  "
                >
                  <option v-for="st in STRATEGY_TYPES" :key="st" :value="st">{{ st }}</option>
                </select>

                <!-- faker -->
                <template v-if="override.generationStrategy?.type === 'faker'">
                  <input
                    v-model="(override.generationStrategy.config as any).method"
                    class="profile-editor__strategy-input"
                    type="text"
                    placeholder="faker method (e.g. person.firstName)"
                    :data-testid="`override-faker-method-${idx}`"
                  />
                  <input
                    v-model="(override.generationStrategy.config as any).locale"
                    class="profile-editor__strategy-input"
                    type="text"
                    placeholder="locale (optional)"
                    :data-testid="`override-faker-locale-${idx}`"
                  />
                </template>

                <!-- enum -->
                <template v-else-if="override.generationStrategy?.type === 'enum'">
                  <div class="profile-editor__enum-values">
                    <span
                      v-for="(val, vi) in (override.generationStrategy.config as any).values"
                      :key="vi"
                      class="profile-editor__enum-chip"
                    >
                      {{ val }}
                      <button
                        class="profile-editor__enum-remove"
                        :data-testid="`override-enum-remove-${idx}-${vi}`"
                        @click="removeEnumValue(override, vi)"
                      >
                        ✕
                      </button>
                    </span>
                    <input
                      class="profile-editor__strategy-input profile-editor__enum-add"
                      type="text"
                      placeholder="Add value + Enter"
                      :data-testid="`override-enum-input-${idx}`"
                      @keydown.enter="addEnumValue(override, $event)"
                    />
                  </div>
                </template>

                <!-- pattern -->
                <template v-else-if="override.generationStrategy?.type === 'pattern'">
                  <input
                    v-model="(override.generationStrategy.config as any).pattern"
                    class="profile-editor__strategy-input"
                    type="text"
                    placeholder="regex pattern (e.g. [A-Z]{3}-\d{4})"
                    :data-testid="`override-pattern-${idx}`"
                  />
                </template>

                <!-- range -->
                <template v-else-if="override.generationStrategy?.type === 'range'">
                  <input
                    v-model.number="(override.generationStrategy.config as any).min"
                    class="profile-editor__strategy-input profile-editor__strategy-input--sm"
                    type="number"
                    placeholder="min"
                    :data-testid="`override-range-min-${idx}`"
                  />
                  <input
                    v-model.number="(override.generationStrategy.config as any).max"
                    class="profile-editor__strategy-input profile-editor__strategy-input--sm"
                    type="number"
                    placeholder="max"
                    :data-testid="`override-range-max-${idx}`"
                  />
                </template>

                <!-- constant -->
                <template v-else-if="override.generationStrategy?.type === 'constant'">
                  <input
                    v-model="(override.generationStrategy.config as any).value"
                    class="profile-editor__strategy-input"
                    type="text"
                    placeholder="constant value"
                    :data-testid="`override-constant-${idx}`"
                  />
                </template>

                <!-- template -->
                <template v-else-if="override.generationStrategy?.type === 'template'">
                  <input
                    v-model="(override.generationStrategy.config as any).template"
                    class="profile-editor__strategy-input"
                    type="text"
                    placeholder="template string (e.g. ORD-{{ uuid }})"
                    :data-testid="`override-template-${idx}`"
                  />
                </template>

                <!-- random: no additional config needed -->
              </div>
            </template>

            <!-- require -->
            <template v-else-if="override.action === 'require'">
              <span class="profile-editor__hint">(forces inclusion of optional field)</span>
            </template>

            <!-- omit -->
            <template v-else-if="override.action === 'omit'">
              <span class="profile-editor__hint">(field excluded from generated event)</span>
            </template>

            <!-- nullify -->
            <template v-else-if="override.action === 'nullify'">
              <span class="profile-editor__hint">(field set to null)</span>
            </template>
          </div>

          <!-- Delete override -->
          <div class="profile-editor__col-del">
            <button
              class="profile-editor__delete-override-btn"
              :aria-label="`Remove override ${idx}`"
              :data-testid="`override-remove-${idx}`"
              @click="removeOverride(idx)"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Preview section -->
    <section class="profile-editor__preview-section">
      <div class="profile-editor__preview-header">
        <h3 class="profile-editor__section-title">Preview</h3>
        <button
          class="profile-editor__btn profile-editor__btn--secondary"
          :disabled="generating || !selectedSchemaId"
          data-testid="generate-sample-btn"
          @click="generateSample"
        >
          {{ generating ? 'Generating…' : 'Generate Sample' }}
        </button>
      </div>

      <div v-if="selectedSchemaId" class="profile-editor__preview-comparison" data-testid="preview-comparison">
        <div class="profile-editor__preview-col">
          <h4 class="profile-editor__preview-col-title">Original Schema</h4>
          <div class="profile-editor__schema-tree">
            <div
              v-for="path in schemaElements"
              :key="path"
              class="profile-editor__schema-field"
              :data-testid="`original-field-${path}`"
            >
              {{ path }}
            </div>
            <div v-if="schemaElements.length === 0" class="profile-editor__preview-empty">
              No fields loaded yet
            </div>
          </div>
        </div>
        <div class="profile-editor__preview-col">
          <h4 class="profile-editor__preview-col-title">With Overrides</h4>
          <div class="profile-editor__schema-tree">
            <div
              v-for="path in schemaElements"
              :key="path"
              class="profile-editor__schema-field"
              :class="getOverrideClass(path)"
              :data-testid="`override-field-${path}`"
            >
              {{ path }}
              <span v-if="getOverrideForPath(path)" class="profile-editor__override-badge">
                {{ getOverrideForPath(path)?.action }}
              </span>
            </div>
            <div v-if="schemaElements.length === 0" class="profile-editor__preview-empty">
              No fields loaded yet
            </div>
          </div>
        </div>
      </div>

      <div v-else class="profile-editor__preview-empty-state" data-testid="preview-empty-state">
        Select a schema context above to see the preview comparison.
      </div>

      <div v-if="samplePayload" class="profile-editor__sample-payload" data-testid="sample-payload-section">
        <h4 class="profile-editor__preview-col-title">Generated Sample</h4>
        <pre class="profile-editor__json-preview" data-testid="sample-payload">{{ samplePayload }}</pre>
      </div>
    </section>
  </div>
</template>

<style scoped>
.profile-editor {
  padding: 24px;
  max-width: 1000px;
  color: #cdd6f4;
}

/* ─── Header ─────────────────────────────────────────────────────────────── */

.profile-editor__header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.profile-editor__header-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-editor__name-input {
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

.profile-editor__name-input:focus {
  border-color: #89b4fa;
}

.profile-editor__desc-input {
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

.profile-editor__desc-input:focus {
  border-color: #89b4fa;
}

.profile-editor__schema-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-editor__label {
  font-size: 12px;
  color: #a6adc8;
  white-space: nowrap;
}

.profile-editor__select {
  background: #181825;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  flex: 1;
  min-width: 140px;
}

.profile-editor__select:focus {
  border-color: #89b4fa;
}

.profile-editor__header-actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding-top: 2px;
  flex-shrink: 0;
}

/* ─── Buttons ────────────────────────────────────────────────────────────── */

.profile-editor__btn {
  padding: 6px 14px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
  white-space: nowrap;
}

.profile-editor__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.profile-editor__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.profile-editor__btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.profile-editor__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
}

.profile-editor__btn--secondary:hover:not(:disabled) {
  background: #45475a;
}

.profile-editor__btn--danger {
  background: rgba(243, 139, 168, 0.15);
  color: #f38ba8;
  border: 1px solid rgba(243, 139, 168, 0.4);
}

.profile-editor__btn--danger:hover:not(:disabled) {
  background: rgba(243, 139, 168, 0.25);
}

/* ─── Error ──────────────────────────────────────────────────────────────── */

.profile-editor__error {
  color: #f38ba8;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: 5px;
  border: 1px solid rgba(243, 139, 168, 0.3);
}

/* ─── Section titles ─────────────────────────────────────────────────────── */

.profile-editor__section-title {
  font-size: 13px;
  font-weight: 600;
  color: #a6adc8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}

/* ─── Overrides section ──────────────────────────────────────────────────── */

.profile-editor__overrides-section {
  margin-bottom: 32px;
}

.profile-editor__overrides-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.profile-editor__overrides-empty {
  font-size: 13px;
  color: #585b70;
  font-style: italic;
  padding: 16px 0;
}

.profile-editor__overrides-table {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-editor__overrides-thead {
  display: grid;
  grid-template-columns: 2fr 1fr 3fr 28px;
  gap: 8px;
  padding: 4px 6px;
  font-size: 11px;
  font-weight: 600;
  color: #585b70;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.profile-editor__override-row {
  display: grid;
  grid-template-columns: 2fr 1fr 3fr 28px;
  gap: 8px;
  align-items: start;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 8px 6px;
}

.profile-editor__col-path,
.profile-editor__col-action,
.profile-editor__col-value,
.profile-editor__col-del {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-editor__col-del {
  align-items: center;
  justify-content: flex-start;
  padding-top: 2px;
}

.profile-editor__path-input,
.profile-editor__value-input {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.profile-editor__path-input:focus,
.profile-editor__value-input:focus {
  border-color: #89b4fa;
}

.profile-editor__action-select {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  width: 100%;
  cursor: pointer;
}

/* Action color coding */
.profile-editor__action--set {
  color: #a6e3a1;
  border-color: rgba(166, 227, 161, 0.4);
}

.profile-editor__action--generate {
  color: #cba6f7;
  border-color: rgba(203, 166, 247, 0.4);
}

.profile-editor__action--omit {
  color: #fab387;
  border-color: rgba(250, 179, 135, 0.4);
}

.profile-editor__action--require {
  color: #89b4fa;
  border-color: rgba(137, 180, 250, 0.4);
}

.profile-editor__action--nullify {
  color: #89dceb;
  border-color: rgba(137, 220, 235, 0.4);
}

.profile-editor__hint {
  font-size: 12px;
  color: #585b70;
  font-style: italic;
  padding: 4px 0;
}

.profile-editor__delete-override-btn {
  background: none;
  border: none;
  color: #585b70;
  font-size: 12px;
  cursor: pointer;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  padding: 0;
}

.profile-editor__delete-override-btn:hover {
  color: #f38ba8;
  background: rgba(243, 139, 168, 0.1);
}

/* ─── Generation strategy ────────────────────────────────────────────────── */

.profile-editor__strategy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-editor__strategy-select {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cba6f7;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}

.profile-editor__strategy-input {
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.profile-editor__strategy-input:focus {
  border-color: #cba6f7;
}

.profile-editor__strategy-input--sm {
  width: 80px;
}

.profile-editor__enum-values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.profile-editor__enum-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(203, 166, 247, 0.15);
  border: 1px solid rgba(203, 166, 247, 0.3);
  color: #cba6f7;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
}

.profile-editor__enum-remove {
  background: none;
  border: none;
  color: #cba6f7;
  font-size: 10px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.profile-editor__enum-remove:hover {
  color: #f38ba8;
}

.profile-editor__enum-add {
  width: 120px;
  flex-shrink: 0;
}

/* ─── Preview section ────────────────────────────────────────────────────── */

.profile-editor__preview-section {
  border-top: 1px solid #313244;
  padding-top: 24px;
}

.profile-editor__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.profile-editor__preview-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}

.profile-editor__preview-col {
  background: #181825;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 12px;
}

.profile-editor__preview-col-title {
  font-size: 12px;
  font-weight: 600;
  color: #a6adc8;
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.profile-editor__schema-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.profile-editor__schema-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #a6adc8;
  padding: 3px 6px;
  border-radius: 3px;
  font-family: monospace;
}

/* Highlighted fields */
.profile-editor__field--set {
  background: rgba(166, 227, 161, 0.1);
  color: #a6e3a1;
}

.profile-editor__field--generate {
  background: rgba(203, 166, 247, 0.1);
  color: #cba6f7;
}

.profile-editor__field--omit {
  background: rgba(250, 179, 135, 0.1);
  color: #fab387;
  text-decoration: line-through;
}

.profile-editor__field--require {
  background: rgba(137, 180, 250, 0.1);
  color: #89b4fa;
}

.profile-editor__field--nullify {
  background: rgba(137, 220, 235, 0.1);
  color: #89dceb;
}

.profile-editor__override-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.profile-editor__preview-empty {
  font-size: 12px;
  color: #45475a;
  font-style: italic;
  padding: 8px 0;
}

.profile-editor__preview-empty-state {
  font-size: 13px;
  color: #585b70;
  font-style: italic;
  padding: 16px 0;
}

.profile-editor__sample-payload {
  margin-top: 16px;
}

.profile-editor__json-preview {
  background: #181825;
  border: 1px solid #313244;
  color: #a6e3a1;
  font-size: 12px;
  font-family: monospace;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre;
  margin: 8px 0 0;
}
</style>
