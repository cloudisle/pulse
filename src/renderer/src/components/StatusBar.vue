<script setup lang="ts">
import { useAwsStore } from '@renderer/stores/aws'

const awsStore = useAwsStore()
</script>

<template>
  <footer class="status-bar">
    <div class="status-bar__spacer" />
    <div class="status-bar__aws">
      <label class="status-bar__label" for="aws-profile-select">AWS Profile</label>
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
</style>
