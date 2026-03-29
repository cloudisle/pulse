<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useSystemStore } from '@renderer/stores/system'

const props = defineProps<{
  environmentId?: string
}>()

const uiStore = useUiStore()
const environmentStore = useEnvironmentStore()
const systemStore = useSystemStore()

const isEditMode = computed(() => !!props.environmentId && props.environmentId !== 'new')

interface VariableRow {
  key: string
  value: string
  sensitive: boolean
  revealed: boolean
}

const name = ref('')
const variables = reactive<VariableRow[]>([])
const errorMessage = ref('')
const saving = ref(false)

onMounted(async () => {
  if (!isEditMode.value) return
  const api = (window as any).app?.api
  if (!api) return
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  try {
    const env = await api.environments.get(systemId, props.environmentId)
    name.value = env.name ?? ''
    variables.push(
      ...env.variables.map((v: { key: string; value: string; sensitive: boolean }) => ({
        key: v.key,
        value: v.value,
        sensitive: v.sensitive,
        revealed: false
      }))
    )
  } catch {
    errorMessage.value = 'Failed to load environment.'
  }
})

function addVariable(): void {
  variables.push({ key: '', value: '', sensitive: false, revealed: false })
}

function removeVariable(index: number): void {
  variables.splice(index, 1)
}

function toggleReveal(row: VariableRow): void {
  row.revealed = !row.revealed
}

async function save(): Promise<void> {
  if (!name.value.trim()) {
    errorMessage.value = 'Environment name is required.'
    return
  }
  errorMessage.value = ''
  saving.value = true
  const api = (window as any).app?.api
  if (!api) {
    saving.value = false
    return
  }
  const systemId = systemStore.selectedSystemId
  if (!systemId) {
    errorMessage.value = 'No system selected.'
    saving.value = false
    return
  }
  try {
    const payload = {
      name: name.value.trim(),
      variables: variables.map((v) => ({ key: v.key, value: v.value, sensitive: v.sensitive }))
    }
    if (isEditMode.value) {
      await api.environments.update(systemId, props.environmentId, payload)
      await environmentStore.list(systemId)
      const tabId = `environment:${props.environmentId}`
      const tab = uiStore.openTabs.find((t) => t.id === tabId)
      if (tab) tab.title = name.value.trim()
    } else {
      await api.environments.create({ systemId, ...payload })
      await environmentStore.list(systemId)
      uiStore.closeTab('environment:new')
    }
  } catch {
    errorMessage.value = 'Failed to save environment.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="env-editor">
    <header class="env-editor__header">
      <input
        v-model="name"
        class="env-editor__name-input"
        type="text"
        placeholder="Environment name"
        aria-label="Environment name"
      />
      <button
        class="env-editor__btn env-editor__btn--primary"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? 'Saving…' : 'Save' }}
      </button>
    </header>

    <p v-if="errorMessage" class="env-editor__error" role="alert">{{ errorMessage }}</p>

    <section class="env-editor__section">
      <table class="env-editor__table">
        <thead>
          <tr>
            <th class="env-editor__th">Key</th>
            <th class="env-editor__th">Value</th>
            <th class="env-editor__th env-editor__th--sensitive">Sensitive</th>
            <th class="env-editor__th env-editor__th--actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in variables"
            :key="idx"
            class="env-editor__row"
            data-testid="variable-row"
          >
            <td class="env-editor__td">
              <input
                v-model="row.key"
                class="env-editor__input"
                type="text"
                placeholder="KEY"
                aria-label="Variable key"
              />
            </td>
            <td class="env-editor__td env-editor__td--value">
              <input
                v-if="!row.sensitive || row.revealed"
                v-model="row.value"
                class="env-editor__input"
                type="text"
                placeholder="value"
                aria-label="Variable value"
              />
              <span v-else class="env-editor__masked" aria-label="Masked value">••••••••</span>
              <button
                v-if="row.sensitive"
                class="env-editor__reveal-btn"
                :title="row.revealed ? 'Hide value' : 'Reveal value'"
                @click="toggleReveal(row)"
              >
                {{ row.revealed ? '🙈' : '👁' }}
              </button>
            </td>
            <td class="env-editor__td env-editor__td--center">
              <input
                v-model="row.sensitive"
                type="checkbox"
                class="env-editor__checkbox"
                aria-label="Sensitive"
                @change="row.revealed = false"
              />
            </td>
            <td class="env-editor__td env-editor__td--center">
              <button
                class="env-editor__delete-btn"
                title="Remove variable"
                @click="removeVariable(idx)"
              >
                ✕
              </button>
            </td>
          </tr>
          <tr v-if="variables.length === 0">
            <td colspan="4" class="env-editor__empty">No variables defined.</td>
          </tr>
        </tbody>
      </table>
    </section>

    <button class="env-editor__add-btn" @click="addVariable">+ Add Variable</button>
  </div>
</template>

<style scoped>
.env-editor {
  padding: 24px;
  max-width: 800px;
  color: #cdd6f4;
}

.env-editor__header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.env-editor__name-input {
  flex: 1;
  background: #181825;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 16px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 5px;
  outline: none;
}

.env-editor__name-input:focus {
  border-color: #89b4fa;
}

.env-editor__btn {
  padding: 6px 14px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.env-editor__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.env-editor__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.env-editor__btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.env-editor__error {
  color: #f38ba8;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: 5px;
  border: 1px solid rgba(243, 139, 168, 0.3);
}

.env-editor__section {
  margin-bottom: 16px;
}

.env-editor__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.env-editor__th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #585b70;
  padding: 6px 8px;
  border-bottom: 1px solid #313244;
}

.env-editor__th--sensitive,
.env-editor__th--actions {
  text-align: center;
  width: 80px;
}

.env-editor__row:hover {
  background: #181825;
}

.env-editor__td {
  padding: 6px 8px;
  vertical-align: middle;
  border-bottom: 1px solid #1e1e2e;
}

.env-editor__td--value {
  display: flex;
  align-items: center;
  gap: 6px;
}

.env-editor__td--center {
  text-align: center;
}

.env-editor__input {
  background: transparent;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 13px;
  padding: 4px 6px;
  border-radius: 4px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  font-family: monospace;
}

.env-editor__input:focus {
  border-color: #89b4fa;
}

.env-editor__masked {
  font-family: monospace;
  color: #585b70;
  letter-spacing: 2px;
  flex: 1;
}

.env-editor__reveal-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  flex-shrink: 0;
}

.env-editor__checkbox {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.env-editor__delete-btn {
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
  margin: 0 auto;
}

.env-editor__delete-btn:hover {
  background: rgba(243, 139, 168, 0.1);
}

.env-editor__empty {
  padding: 16px 8px;
  font-size: 12px;
  color: #45475a;
  font-style: italic;
  text-align: center;
}

.env-editor__add-btn {
  background: none;
  border: 1px solid #89b4fa;
  color: #89b4fa;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.env-editor__add-btn:hover {
  background: rgba(137, 180, 250, 0.1);
}
</style>
