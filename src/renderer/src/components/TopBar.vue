<script setup lang="ts">
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useProfileStore } from '@renderer/stores/profile'
import { useUiStore } from '@renderer/stores/ui'

const environmentStore = useEnvironmentStore()
const profileStore = useProfileStore()
const uiStore = useUiStore()

function openProfileEditor(): void {
  uiStore.openTab({ id: 'profile:new', type: 'profile', title: 'New Profile' })
}
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__logo">
      <span class="top-bar__title">Pulse</span>
    </div>
    <div class="top-bar__spacer" />
    <div class="top-bar__right">
      <div class="top-bar__group">
        <label class="top-bar__label" for="environment-select">Environment</label>
        <select
          id="environment-select"
          class="top-bar__select"
          :value="environmentStore.selectedEnvironmentId ?? ''"
          @change="environmentStore.selectEnvironment(($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">(none)</option>
          <option
            v-for="env in environmentStore.environments"
            :key="env.id"
            :value="env.id"
          >{{ env.name }}</option>
        </select>
      </div>
      <div class="top-bar__group">
        <label class="top-bar__label">Profiles</label>
        <div class="top-bar__profile-list">
          <span
            v-for="profile in profileStore.availableProfiles"
            :key="profile.id"
            class="top-bar__profile-chip"
            :class="{ 'top-bar__profile-chip--active': profileStore.activeProfileIds.includes(profile.id) }"
            role="button"
            tabindex="0"
            @click="profileStore.toggleProfile(profile.id)"
            @keydown.enter="profileStore.toggleProfile(profile.id)"
          >
            <span
              v-if="profileStore.activeProfileIds.includes(profile.id)"
              class="top-bar__profile-order"
            >{{ profileStore.activeProfileIds.indexOf(profile.id) + 1 }}</span>
            {{ profile.name }}
          </span>
          <span v-if="profileStore.availableProfiles.length === 0" class="top-bar__profile-empty">
            No profiles —
            <a
              href="#"
              class="top-bar__profile-create-link"
              @click.prevent="openProfileEditor"
            >create one</a>
          </span>
        </div>
        <button
          v-if="profileStore.activeProfileIds.length >= 2"
          class="top-bar__preview-btn"
          data-testid="preview-stack-btn"
          @click="uiStore.openStackPreview()"
        >Preview stack</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  background: #1e1e2e;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.top-bar__logo {
  flex: 0 0 auto;
}

.top-bar__title {
  font-size: 18px;
  font-weight: 700;
  color: #cdd6f4;
  letter-spacing: 0.04em;
}

.top-bar__spacer {
  flex: 1 1 auto;
}

.top-bar__right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.top-bar__group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-bar__label {
  font-size: 12px;
  color: #a6adc8;
  white-space: nowrap;
}

.top-bar__select {
  padding: 4px 8px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.top-bar__profile-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.top-bar__profile-chip {
  padding: 2px 10px;
  border-radius: 12px;
  background: #313244;
  color: #cdd6f4;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #45475a;
  user-select: none;
}

.top-bar__profile-chip--active {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.top-bar__profile-empty {
  font-size: 12px;
  color: #585b70;
  font-style: italic;
}

.top-bar__preview-btn {
  padding: 3px 10px;
  background: #313244;
  color: #89b4fa;
  border: 1px solid #89b4fa;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.top-bar__preview-btn:hover {
  background: rgba(137, 180, 250, 0.15);
}

.top-bar__profile-create-link {
  color: #89b4fa;
  text-decoration: underline;
  cursor: pointer;
}

.top-bar__profile-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #1e1e2e;
  color: #89b4fa;
  font-size: 9px;
  font-weight: 700;
  margin-right: 3px;
  flex-shrink: 0;
}
</style>
