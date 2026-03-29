<script setup lang="ts">
import { ref } from 'vue'

export interface SensitiveVar {
  envName: string
  key: string
  value: string
}

const props = defineProps<{
  vars: SensitiveVar[]
}>()

const emit = defineEmits<{
  confirm: [vars: SensitiveVar[]]
  cancel: []
}>()

const values = ref<SensitiveVar[]>(props.vars.map((v) => ({ ...v })))

function onConfirm(): void {
  emit('confirm', values.value)
}

function onCancel(): void {
  emit('cancel')
}
</script>

<template>
  <div class="sensitive-dialog__backdrop" @click.self="onCancel">
    <div class="sensitive-dialog" role="dialog" aria-modal="true" aria-labelledby="sensitive-dialog-title">
      <h2 id="sensitive-dialog-title" class="sensitive-dialog__title">Fill in Sensitive Variables</h2>
      <p class="sensitive-dialog__desc">
        The imported system has sensitive environment variables with no values. Please provide them below.
      </p>
      <div class="sensitive-dialog__fields">
        <div v-for="(v, idx) in values" :key="idx" class="sensitive-dialog__field">
          <label class="sensitive-dialog__label">
            <span class="sensitive-dialog__env-name">{{ v.envName }}</span>
            <span class="sensitive-dialog__separator"> / </span>
            <span class="sensitive-dialog__key">{{ v.key }}</span>
          </label>
          <input
            v-model="v.value"
            class="sensitive-dialog__input"
            type="password"
            :placeholder="`Value for ${v.key}`"
            :aria-label="`${v.envName} / ${v.key}`"
          />
        </div>
      </div>
      <div class="sensitive-dialog__actions">
        <button class="sensitive-dialog__btn sensitive-dialog__btn--secondary" @click="onCancel">
          Cancel
        </button>
        <button class="sensitive-dialog__btn sensitive-dialog__btn--primary" @click="onConfirm">
          Import
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sensitive-dialog__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.sensitive-dialog {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 8px;
  padding: 24px;
  min-width: 360px;
  max-width: 520px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  color: #cdd6f4;
}

.sensitive-dialog__title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}

.sensitive-dialog__desc {
  font-size: 13px;
  color: #a6adc8;
  margin: 0 0 20px;
}

.sensitive-dialog__fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
  max-height: 320px;
  overflow-y: auto;
}

.sensitive-dialog__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sensitive-dialog__label {
  font-size: 11px;
  font-weight: 500;
  color: #a6adc8;
}

.sensitive-dialog__env-name {
  color: #89b4fa;
}

.sensitive-dialog__separator {
  color: #585b70;
}

.sensitive-dialog__key {
  color: #a6e3a1;
}

.sensitive-dialog__input {
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

.sensitive-dialog__input:focus {
  border-color: #89b4fa;
}

.sensitive-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.sensitive-dialog__btn {
  padding: 6px 16px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.sensitive-dialog__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.sensitive-dialog__btn--primary:hover {
  background: #b4befe;
}

.sensitive-dialog__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
}

.sensitive-dialog__btn--secondary:hover {
  background: #45475a;
}
</style>
