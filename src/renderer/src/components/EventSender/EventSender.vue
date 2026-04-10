<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useEventSenderStore } from '@renderer/stores/event-sender.store'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useSessionStore } from '@renderer/stores/session.store'
import type { ProfileOverride, OverrideAction } from '@shared/models/profile'
import type { GenerationStrategy, StrategyType } from '@shared/models/generation'

const store = useEventSenderStore()
const systemStore = useSystemStore()
const schemaStore = useSchemaStore()
const profileStore = useProfileStore()
const environmentStore = useEnvironmentStore()
const sessionStore = useSessionStore()

const STRATEGY_TYPES: StrategyType[] = [
  'random',
  'faker',
  'enum',
  'pattern',
  'range',
  'constant',
  'template'
]

async function init(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  await store.loadInputs(systemId)
}

onMounted(init)

watch(() => systemStore.selectedSystemId, init)

watch(
  () => store.selectedSchemaId,
  async (schemaId) => {
    const systemId = systemStore.selectedSystemId
    if (systemId && schemaId) {
      await store.loadSchemaElements(systemId, schemaId)
    } else {
      store.schemaElements = []
    }
  }
)

async function onGenerate(): Promise<void> {
  if (!store.selectedSchemaId) {
    store.errorMessage = 'Select a schema first.'
    return
  }
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  await store.generate(systemId, profileStore.activeProfileIds, environmentStore.selectedEnvironmentId)
}

async function onValidate(): Promise<void> {
  await store.validate()
}

async function onSend(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  await store.send(systemId, sessionStore.selectedSessionId, environmentStore.selectedEnvironmentId)
}

// ─── Override action helpers ─────────────────────────────────────────────────

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
</script>

<template>
  <div class="event-sender">
    <!-- Header -->
    <header class="event-sender__header">
      <h2 class="event-sender__title" data-testid="event-sender-title">Send Event</h2>
    </header>

    <div class="event-sender__body">
      <!-- Configuration panel -->
      <section class="event-sender__config" data-testid="config-panel">
        <h3 class="event-sender__section-title">Configuration</h3>

        <!-- Schema selector -->
        <div class="event-sender__field">
          <label class="event-sender__label" for="schema-select">Schema</label>
          <select
            id="schema-select"
            class="event-sender__select"
            data-testid="schema-select"
            :value="store.selectedSchemaId ?? ''"
            @change="store.selectedSchemaId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="" disabled>Select a schema…</option>
            <option
              v-for="schema in schemaStore.schemas"
              :key="schema.id"
              :value="schema.id"
            >{{ schema.name }}</option>
          </select>
        </div>

        <!-- Input (destination) selector -->
        <div class="event-sender__field">
          <label class="event-sender__label" for="input-select">Destination</label>
          <select
            id="input-select"
            class="event-sender__select"
            data-testid="input-select"
            :value="store.selectedInputId ?? ''"
            @change="store.selectedInputId = ($event.target as HTMLSelectElement).value || null"
          >
            <option value="" disabled>Select an input…</option>
            <option
              v-for="input in store.inputs"
              :key="input.id"
              :value="input.id"
            >{{ input.name }} ({{ input.type }})</option>
          </select>
        </div>

        <!-- Active profiles -->
        <div class="event-sender__field">
          <label class="event-sender__label">Active Profiles</label>
          <div class="event-sender__profile-list" data-testid="profile-list">
            <span
              v-for="profile in profileStore.availableProfiles"
              :key="profile.id"
              class="event-sender__profile-chip"
              :class="{ 'event-sender__profile-chip--active': profileStore.activeProfileIds.includes(profile.id) }"
              role="button"
              tabindex="0"
              data-testid="profile-chip"
              @click="profileStore.toggleProfile(profile.id)"
              @keydown.enter="profileStore.toggleProfile(profile.id)"
            >{{ profile.name }}</span>
            <span
              v-if="profileStore.availableProfiles.length === 0"
              class="event-sender__profile-empty"
            >No profiles available</span>
          </div>
        </div>

        <!-- Ad-hoc overrides -->
        <div class="event-sender__field">
          <div class="event-sender__overrides-header">
            <label class="event-sender__label">Ad-hoc Overrides</label>
            <button
              class="event-sender__btn event-sender__btn--ghost"
              data-testid="add-override-btn"
              @click="store.addOverride()"
            >
              + Add
            </button>
          </div>
          <div
            v-if="store.overrides.length === 0"
            class="event-sender__overrides-empty"
            data-testid="overrides-empty"
          >
            No overrides
          </div>

          <div
            v-for="(override, idx) in store.overrides"
            :key="idx"
            class="event-sender__override-block"
            :data-testid="`override-row-${idx}`"
          >
            <!-- Path row -->
            <div class="event-sender__override-path-row">
              <input
                class="event-sender__input event-sender__input--path"
                type="text"
                placeholder="element.path"
                :value="override.elementPath"
                :list="`override-path-suggestions-${idx}`"
                :data-testid="`override-path-${idx}`"
                @input="override.elementPath = ($event.target as HTMLInputElement).value"
              />
              <datalist :id="`override-path-suggestions-${idx}`">
                <option v-for="p in store.schemaElements" :key="p" :value="p" />
              </datalist>
              <select
                class="event-sender__action-select"
                :class="`event-sender__action--${override.action}`"
                :value="override.action"
                :data-testid="`override-action-${idx}`"
                @change="onActionChange(override, ($event.target as HTMLSelectElement).value as OverrideAction)"
              >
                <option value="set">set</option>
                <option value="generate">generate</option>
                <option value="omit">omit</option>
                <option value="require">require</option>
                <option value="nullify">nullify</option>
              </select>
              <button
                class="event-sender__btn event-sender__btn--ghost event-sender__btn--danger"
                :data-testid="`remove-override-${idx}`"
                @click="store.removeOverride(idx)"
              >
                ×
              </button>
            </div>

            <!-- Value / Config row -->
            <div class="event-sender__override-config">
              <!-- set: value input -->
              <template v-if="override.action === 'set'">
                <input
                  v-model="override.value"
                  class="event-sender__input"
                  type="text"
                  placeholder='Value (e.g. "active", 42, true)'
                  :data-testid="`override-value-${idx}`"
                />
              </template>

              <!-- generate: strategy config -->
              <template v-else-if="override.action === 'generate'">
                <div class="event-sender__strategy">
                  <select
                    class="event-sender__strategy-select"
                    :value="override.generationStrategy?.type ?? 'random'"
                    :data-testid="`override-strategy-type-${idx}`"
                    @change="onStrategyTypeChange(override, ($event.target as HTMLSelectElement).value as StrategyType)"
                  >
                    <option v-for="st in STRATEGY_TYPES" :key="st" :value="st">{{ st }}</option>
                  </select>

                  <!-- faker -->
                  <template v-if="override.generationStrategy?.type === 'faker'">
                    <input
                      v-model="(override.generationStrategy.config as any).method"
                      class="event-sender__strategy-input"
                      type="text"
                      placeholder="faker method (e.g. person.firstName)"
                      :data-testid="`override-faker-method-${idx}`"
                    />
                    <input
                      v-model="(override.generationStrategy.config as any).locale"
                      class="event-sender__strategy-input"
                      type="text"
                      placeholder="locale (optional)"
                      :data-testid="`override-faker-locale-${idx}`"
                    />
                  </template>

                  <!-- enum -->
                  <template v-else-if="override.generationStrategy?.type === 'enum'">
                    <div class="event-sender__enum-values">
                      <span
                        v-for="(val, vi) in (override.generationStrategy.config as any).values"
                        :key="vi"
                        class="event-sender__enum-chip"
                      >
                        {{ val }}
                        <button
                          class="event-sender__enum-remove"
                          :data-testid="`override-enum-remove-${idx}-${vi}`"
                          @click="removeEnumValue(override, vi)"
                        >✕</button>
                      </span>
                      <input
                        class="event-sender__strategy-input"
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
                      class="event-sender__strategy-input"
                      type="text"
                      placeholder="regex pattern (e.g. [A-Z]{3}-\d{4})"
                      :data-testid="`override-pattern-${idx}`"
                    />
                  </template>

                  <!-- range -->
                  <template v-else-if="override.generationStrategy?.type === 'range'">
                    <input
                      v-model.number="(override.generationStrategy.config as any).min"
                      class="event-sender__strategy-input event-sender__strategy-input--sm"
                      type="number"
                      placeholder="min"
                      :data-testid="`override-range-min-${idx}`"
                    />
                    <input
                      v-model.number="(override.generationStrategy.config as any).max"
                      class="event-sender__strategy-input event-sender__strategy-input--sm"
                      type="number"
                      placeholder="max"
                      :data-testid="`override-range-max-${idx}`"
                    />
                  </template>

                  <!-- constant -->
                  <template v-else-if="override.generationStrategy?.type === 'constant'">
                    <input
                      v-model="(override.generationStrategy.config as any).value"
                      class="event-sender__strategy-input"
                      type="text"
                      placeholder="constant value"
                      :data-testid="`override-constant-${idx}`"
                    />
                  </template>

                  <!-- template -->
                  <template v-else-if="override.generationStrategy?.type === 'template'">
                    <input
                      v-model="(override.generationStrategy.config as any).template"
                      class="event-sender__strategy-input"
                      type="text"
                      placeholder="template string (e.g. ORD-{{ uuid }})"
                      :data-testid="`override-template-string-${idx}`"
                    />
                  </template>
                </div>
              </template>

              <!-- omit -->
              <template v-else-if="override.action === 'omit'">
                <span class="event-sender__hint">(field excluded from generated event)</span>
              </template>

              <!-- require -->
              <template v-else-if="override.action === 'require'">
                <span class="event-sender__hint">(forces inclusion of optional field)</span>
              </template>

              <!-- nullify -->
              <template v-else-if="override.action === 'nullify'">
                <span class="event-sender__hint">(field set to null)</span>
              </template>
            </div>
          </div>
        </div>

        <!-- Generate button -->
        <button
          class="event-sender__btn event-sender__btn--primary"
          data-testid="generate-btn"
          :disabled="store.generating"
          @click="onGenerate"
        >
          {{ store.generating ? 'Generating…' : 'Generate' }}
        </button>
      </section>

      <!-- Preview panel -->
      <section class="event-sender__preview" data-testid="preview-panel">
        <h3 class="event-sender__section-title">Preview</h3>

        <textarea
          class="event-sender__json-editor"
          data-testid="preview-editor"
          :value="store.previewJson"
          placeholder="Generated event payload will appear here…"
          spellcheck="false"
          @input="store.previewJson = ($event.target as HTMLTextAreaElement).value"
        />

        <!-- Validation warnings -->
        <div
          v-if="store.validationWarnings.length > 0"
          class="event-sender__warnings"
          data-testid="validation-warnings"
        >
          <div
            v-for="(warning, idx) in store.validationWarnings"
            :key="idx"
            class="event-sender__warning"
            :class="`event-sender__warning--${warning.severity}`"
            :data-testid="`warning-${idx}`"
          >
            <span class="event-sender__warning-path">{{ warning.elementPath }}</span>
            <span class="event-sender__warning-message">{{ warning.message }}</span>
          </div>
        </div>

        <!-- Error message -->
        <p
          v-if="store.errorMessage"
          class="event-sender__error"
          data-testid="error-message"
        >
          {{ store.errorMessage }}
        </p>

        <!-- Send result -->
        <div
          v-if="store.sendResult"
          class="event-sender__send-result"
          :class="store.sendResult.success ? 'event-sender__send-result--success' : 'event-sender__send-result--failure'"
          data-testid="send-result"
        >
          <span v-if="store.sendResult.success">✓ Event sent successfully</span>
          <span v-else>✗ {{ store.sendResult.error ?? 'Failed to send event.' }}</span>
        </div>

        <!-- Action buttons -->
        <div class="event-sender__actions">
          <button
            class="event-sender__btn event-sender__btn--secondary"
            data-testid="validate-btn"
            :disabled="!store.generatedEvent"
            @click="onValidate"
          >
            Validate
          </button>
          <button
            class="event-sender__btn event-sender__btn--primary"
            data-testid="send-btn"
            :disabled="store.sending || !store.generatedEvent"
            @click="onSend"
          >
            {{ store.sending ? 'Sending…' : 'Send' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.event-sender {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #cdd6f4;
  font-size: 14px;
}

.event-sender__header {
  flex-shrink: 0;
  padding: 0 0 16px 0;
  border-bottom: 1px solid #313244;
  margin-bottom: 16px;
}

.event-sender__title {
  font-size: 20px;
  font-weight: 700;
  color: #cdd6f4;
  margin: 0 0 12px 0;
}

.event-sender__session-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.event-sender__body {
  flex: 1;
  display: flex;
  gap: 24px;
  overflow: hidden;
}

.event-sender__config {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.event-sender__preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.event-sender__section-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #585b70;
  margin: 0 0 4px 0;
}

.event-sender__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.event-sender__label {
  font-size: 12px;
  color: #a6adc8;
  font-weight: 500;
}

.event-sender__select {
  padding: 6px 8px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  outline: none;
}

.event-sender__select:focus {
  border-color: #89b4fa;
}

.event-sender__input {
  padding: 5px 8px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 12px;
  outline: none;
  flex: 1;
  min-width: 0;
}

.event-sender__input:focus {
  border-color: #89b4fa;
}

.event-sender__input--path {
  font-family: monospace;
}

.event-sender__profile-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.event-sender__profile-chip {
  padding: 2px 10px;
  border-radius: 12px;
  background: #313244;
  color: #cdd6f4;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #45475a;
  user-select: none;
}

.event-sender__profile-chip--active {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.event-sender__profile-empty {
  font-size: 12px;
  color: #585b70;
  font-style: italic;
}

.event-sender__overrides-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.event-sender__overrides-empty {
  font-size: 12px;
  color: #45475a;
  font-style: italic;
}

.event-sender__override-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 4px;
}

.event-sender__override-path-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.event-sender__override-config {
  padding-left: 2px;
}

.event-sender__action-select {
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

.event-sender__action-select:focus {
  border-color: #89b4fa;
}

.event-sender__action--set { color: #a6e3a1; }
.event-sender__action--generate { color: #89b4fa; }
.event-sender__action--omit { color: #f38ba8; }
.event-sender__action--require { color: #fab387; }
.event-sender__action--nullify { color: #cba6f7; }

.event-sender__strategy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-sender__strategy-select {
  padding: 4px 6px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  outline: none;
}

.event-sender__strategy-input {
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

.event-sender__strategy-input:focus {
  border-color: #89b4fa;
}

.event-sender__strategy-input--sm {
  width: 80px;
  flex: none;
}

.event-sender__enum-values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.event-sender__enum-chip {
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

.event-sender__enum-remove {
  background: none;
  border: none;
  color: #585b70;
  cursor: pointer;
  padding: 0;
  font-size: 10px;
  line-height: 1;
}

.event-sender__enum-remove:hover {
  color: #f38ba8;
}

.event-sender__hint {
  font-size: 11px;
  color: #585b70;
  font-style: italic;
}

.event-sender__json-editor {
  flex: 1;
  background: #181825;
  color: #cdd6f4;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: none;
  outline: none;
  tab-size: 2;
  min-height: 200px;
}

.event-sender__json-editor:focus {
  border-color: #89b4fa;
}

.event-sender__warnings {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.event-sender__warning {
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  border: 1px solid;
}

.event-sender__warning--warning {
  background: #2a2019;
  border-color: #f9e2af44;
  color: #f9e2af;
}

.event-sender__warning--info {
  background: #1a2030;
  border-color: #89b4fa44;
  color: #89b4fa;
}

.event-sender__warning-path {
  font-family: monospace;
  font-weight: 600;
  flex-shrink: 0;
}

.event-sender__warning-message {
  color: inherit;
  opacity: 0.9;
}

.event-sender__error {
  color: #f38ba8;
  font-size: 13px;
  margin: 0;
  padding: 8px 10px;
  background: #2a1520;
  border: 1px solid #f38ba844;
  border-radius: 4px;
}

.event-sender__send-result {
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  border: 1px solid;
}

.event-sender__send-result--success {
  background: #1a2a1a;
  border-color: #a6e3a144;
  color: #a6e3a1;
}

.event-sender__send-result--failure {
  background: #2a1520;
  border-color: #f38ba844;
  color: #f38ba8;
}

.event-sender__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* Buttons */
.event-sender__btn {
  padding: 7px 16px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s ease;
}

.event-sender__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.event-sender__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.event-sender__btn--primary:hover:not(:disabled) {
  background: #b4befe;
  border-color: #b4befe;
}

.event-sender__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.event-sender__btn--secondary:hover:not(:disabled) {
  background: #45475a;
}

.event-sender__btn--ghost {
  background: transparent;
  color: #a6adc8;
  border-color: transparent;
  padding: 3px 8px;
  font-size: 12px;
}

.event-sender__btn--ghost:hover:not(:disabled) {
  background: #313244;
  color: #cdd6f4;
}

.event-sender__btn--danger {
  color: #f38ba8;
}

.event-sender__btn--danger:hover:not(:disabled) {
  color: #f38ba8;
  background: #2a1520;
}
</style>
