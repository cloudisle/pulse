<script setup lang="ts">
import { onMounted } from 'vue'
import { useAwsStore } from '@renderer/stores/aws'

const awsStore = useAwsStore()

onMounted(() => {
  awsStore.loadProfiles()
})
</script>

<template>
  <footer class="status-bar">
    <div class="status-bar__spacer" />
    <div class="status-bar__aws">
      <label class="status-bar__label" for="aws-profile-select">AWS Profile</label>
      <button
        class="status-bar__refresh-btn"
        :disabled="awsStore.loadingProfiles"
        :title="awsStore.loadingProfiles ? 'Refreshing profiles…' : 'Refresh profiles'"
        @click="awsStore.loadProfiles()"
      >
        <span
          class="status-bar__refresh-icon"
          :class="{ 'status-bar__refresh-icon--pending': awsStore.loadingProfiles }"
        >⟳</span>
      </button>
      <select
        id="aws-profile-select"
        class="status-bar__select"
        :value="awsStore.selectedProfile ?? ''"
        @change="awsStore.selectProfile(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>Select profile…</option>
        <option
          v-for="profile in awsStore.availableProfiles"
          :key="profile"
          :value="profile"
        >{{ profile }}</option>
      </select>
      <button
        class="status-bar__validate-btn"
        :disabled="!awsStore.selectedProfile || awsStore.validating"
        :title="awsStore.validating ? 'Validating…' : 'Validate credentials'"
        @click="awsStore.validateCredentials(awsStore.selectedProfile!)"
      >
        <span v-if="awsStore.validating" class="status-bar__validate-icon status-bar__validate-icon--pending">⟳</span>
        <span
          v-else-if="awsStore.validationResult !== null"
          class="status-bar__validate-icon"
          :class="awsStore.validationResult.valid ? 'status-bar__validate-icon--success' : 'status-bar__validate-icon--failure'"
          :title="awsStore.validationResult.valid ? `Valid — ${awsStore.validationResult.identity?.arn ?? ''}` : awsStore.validationResult.error"
        >{{ awsStore.validationResult.valid ? '✓' : '✗' }}</span>
        <span v-else class="status-bar__validate-icon">✓?</span>
      </button>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  background: #11111b;
  border-top: 1px solid #313244;
  flex-shrink: 0;
}

.status-bar__spacer {
  flex: 1;
}

.status-bar__aws {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-bar__label {
  font-size: 11px;
  color: #585b70;
  white-space: nowrap;
}

.status-bar__select {
  padding: 1px 6px;
  background: #1e1e2e;
  color: #a6adc8;
  border: 1px solid #313244;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
}

.status-bar__validate-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  height: 16px;
  background: transparent;
  border: 1px solid #45475a;
  border-radius: 3px;
  font-size: 10px;
  cursor: pointer;
  color: #a6adc8;
  line-height: 1;
}

.status-bar__refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  height: 16px;
  background: transparent;
  border: 1px solid #45475a;
  border-radius: 3px;
  font-size: 10px;
  cursor: pointer;
  color: #a6adc8;
  line-height: 1;
}

.status-bar__refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.status-bar__refresh-icon--pending {
  color: #f9e2af;
  animation: spin 1s linear infinite;
}

.status-bar__refresh-icon {
  font-size: 12px;
}

.status-bar__validate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.status-bar__validate-icon--success {
  color: #a6e3a1;
}

.status-bar__validate-icon--failure {
  color: #f38ba8;
}

.status-bar__validate-icon--pending {
  color: #f9e2af;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
