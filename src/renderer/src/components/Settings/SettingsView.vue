<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import type { AppSettings } from '@shared/models/settings'

const DEFAULT_SETTINGS: Omit<AppSettings, 'dataDirectory'> & { dataDirectory: string } = {
  sessionHistoryLimit: 10,
  defaultRegion: 'us-east-1',
  theme: 'dark',
  logLevel: 'info',
  dataDirectory: ''
}

const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
const saving = ref(false)
const saveError = ref<string | null>(null)
const saveSuccess = ref(false)

onMounted(async () => {
  const loaded = await window.app.api.app.getSettings()
  settings.value = { ...loaded }
  applyTheme(loaded.theme)
})

watch(
  () => settings.value.theme,
  (theme) => applyTheme(theme)
)

function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  document.documentElement.setAttribute('data-theme', theme)
}

async function onSave(): Promise<void> {
  saving.value = true
  saveError.value = null
  saveSuccess.value = false
  try {
    const updated = await window.app.api.app.updateSettings({ ...settings.value })
    settings.value = { ...updated }
    applyTheme(updated.theme)
    saveSuccess.value = true
    setTimeout(() => { saveSuccess.value = false }, 2000)
  } catch (e: any) {
    saveError.value = e?.message ?? 'Failed to save settings'
  } finally {
    saving.value = false
  }
}

function onReset(): void {
  settings.value = {
    ...DEFAULT_SETTINGS,
    dataDirectory: settings.value.dataDirectory
  }
  applyTheme(settings.value.theme)
}

async function onChangeDirectory(): Promise<void> {
  const selected = await window.app.api.app.selectDirectory()
  if (selected !== null) {
    settings.value.dataDirectory = selected
  }
}
</script>

<template>
  <div class="settings-view">
    <h2 class="settings-view__title">Settings</h2>

    <div class="settings-view__form">
      <!-- Session History Limit -->
      <div class="settings-view__field">
        <label class="settings-view__label" for="session-history-limit">Session History Limit</label>
        <input
          id="session-history-limit"
          v-model.number="settings.sessionHistoryLimit"
          class="settings-view__input"
          type="number"
          min="1"
          data-testid="session-history-limit"
        />
      </div>

      <!-- Default Region -->
      <div class="settings-view__field">
        <label class="settings-view__label" for="default-region">Default Region</label>
        <input
          id="default-region"
          v-model="settings.defaultRegion"
          class="settings-view__input"
          type="text"
          data-testid="default-region"
        />
      </div>

      <!-- Theme -->
      <div class="settings-view__field">
        <label class="settings-view__label" for="theme">Theme</label>
        <select
          id="theme"
          v-model="settings.theme"
          class="settings-view__select"
          data-testid="theme"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </div>

      <!-- Data Directory -->
      <div class="settings-view__field">
        <label class="settings-view__label" for="data-directory">Data Directory</label>
        <div class="settings-view__dir-row">
          <input
            id="data-directory"
            class="settings-view__input settings-view__input--readonly"
            type="text"
            :value="settings.dataDirectory"
            readonly
            data-testid="data-directory"
          />
          <button
            class="settings-view__btn settings-view__btn--secondary"
            data-testid="change-directory"
            @click="onChangeDirectory"
          >
            Change
          </button>
        </div>
      </div>

      <!-- Log Level -->
      <div class="settings-view__field">
        <label class="settings-view__label" for="log-level">Log Level</label>
        <select
          id="log-level"
          v-model="settings.logLevel"
          class="settings-view__select"
          data-testid="log-level"
        >
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
      </div>

      <!-- Actions -->
      <div class="settings-view__actions">
        <button
          class="settings-view__btn settings-view__btn--primary"
          :disabled="saving"
          data-testid="save-btn"
          @click="onSave"
        >
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
        <button
          class="settings-view__btn settings-view__btn--ghost"
          data-testid="reset-btn"
          @click="onReset"
        >
          Reset to Defaults
        </button>
      </div>

      <p v-if="saveSuccess" class="settings-view__success" data-testid="save-success">
        Settings saved.
      </p>
      <p v-if="saveError" class="settings-view__error" data-testid="save-error">
        {{ saveError }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  max-width: 560px;
  padding: 32px 24px;
  color: #cdd6f4;
}

.settings-view__title {
  font-size: 18px;
  font-weight: 700;
  color: #cdd6f4;
  margin: 0 0 28px;
}

.settings-view__form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-view__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-view__label {
  font-size: 12px;
  font-weight: 600;
  color: #a6adc8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.settings-view__input,
.settings-view__select {
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  font-size: 13px;
  padding: 7px 10px;
  border-radius: 4px;
  outline: none;
}

.settings-view__input:focus,
.settings-view__select:focus {
  border-color: #89b4fa;
}

.settings-view__input--readonly {
  color: #a6adc8;
  cursor: default;
  flex: 1;
}

.settings-view__dir-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.settings-view__actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.settings-view__btn {
  padding: 7px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
}

.settings-view__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.settings-view__btn--primary:hover:not(:disabled) {
  background: #b4befe;
  border-color: #b4befe;
}

.settings-view__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.settings-view__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.settings-view__btn--secondary:hover {
  background: #45475a;
}

.settings-view__btn--ghost {
  background: none;
  color: #a6adc8;
  border-color: #45475a;
}

.settings-view__btn--ghost:hover {
  background: #313244;
  color: #cdd6f4;
}

.settings-view__success {
  font-size: 13px;
  color: #a6e3a1;
  margin: 0;
}

.settings-view__error {
  font-size: 13px;
  color: #f38ba8;
  margin: 0;
}
</style>
