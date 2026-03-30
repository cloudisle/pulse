<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useEventSenderStore } from '@renderer/stores/event-sender.store'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useAwsStore } from '@renderer/stores/aws'
import type { CloudOperationSettings } from '../../../../shared/models/aws'

const store = useEventSenderStore()
const systemStore = useSystemStore()
const schemaStore = useSchemaStore()
const profileStore = useProfileStore()
const environmentStore = useEnvironmentStore()
const awsStore = useAwsStore()

async function init(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  await Promise.all([store.loadSessions(systemId), store.loadInputs(systemId)])
}

onMounted(init)

watch(() => systemStore.selectedSystemId, init)

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
  const cloud: CloudOperationSettings | undefined = awsStore.selectedProfile
    ? { aws: { profile: awsStore.selectedProfile } }
    : undefined
  await store.send(systemId, cloud, environmentStore.selectedEnvironmentId)
}

async function onCreateSession(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  await store.createSession(systemId)
}
</script>

<template>
  <div class="event-sender">
    <!-- Header -->
    <header class="event-sender__header">
      <h2 class="event-sender__title" data-testid="event-sender-title">Send Event</h2>
      <div class="event-sender__session-row">
        <label class="event-sender__label" for="session-select">Session</label>
        <select
          id="session-select"
          class="event-sender__select"
          data-testid="session-select"
          :value="store.selectedSessionId ?? ''"
          @change="store.selectedSessionId = ($event.target as HTMLSelectElement).value || null"
        >
          <option value="" disabled>Select a session…</option>
          <option
            v-for="session in store.sessions"
            :key="session.id"
            :value="session.id"
          >{{ session.name ?? session.id }}</option>
        </select>
        <button
          class="event-sender__btn event-sender__btn--secondary"
          data-testid="new-session-btn"
          @click="onCreateSession"
        >
          New Session
        </button>
      </div>
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
            class="event-sender__override-row"
            :data-testid="`override-row-${idx}`"
          >
            <input
              class="event-sender__input"
              placeholder="element.path"
              :value="override.elementPath"
              :data-testid="`override-path-${idx}`"
              @input="override.elementPath = ($event.target as HTMLInputElement).value"
            />
            <span class="event-sender__override-arrow">→</span>
            <input
              class="event-sender__input"
              placeholder="value"
              :value="override.value"
              :data-testid="`override-value-${idx}`"
              @input="override.value = ($event.target as HTMLInputElement).value"
            />
            <button
              class="event-sender__btn event-sender__btn--ghost event-sender__btn--danger"
              :data-testid="`remove-override-${idx}`"
              @click="store.removeOverride(idx)"
            >
              ×
            </button>
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

.event-sender__override-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.event-sender__override-arrow {
  color: #585b70;
  flex-shrink: 0;
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
