<script setup lang="ts">
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <div class="tab-bar" role="tablist">
    <div
      v-for="tab in uiStore.openTabs"
      :key="tab.id"
      class="tab-bar__tab"
      :class="{ 'tab-bar__tab--active': uiStore.activeTabId === tab.id }"
      role="tab"
      :aria-selected="uiStore.activeTabId === tab.id"
      tabindex="0"
      @click="uiStore.setActiveTab(tab.id)"
      @keydown.enter="uiStore.setActiveTab(tab.id)"
    >
      <span class="tab-bar__tab-title">{{ tab.title }}</span>
      <button
        class="tab-bar__close"
        :aria-label="`Close ${tab.title}`"
        @click.stop="uiStore.closeTab(tab.id)"
      >×</button>
    </div>
    <div v-if="uiStore.openTabs.length === 0" class="tab-bar__empty">No open tabs</div>
  </div>
</template>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  height: 36px;
  background: #181825;
  border-bottom: 1px solid #313244;
  overflow: hidden;
  flex-shrink: 0;
}

.tab-bar__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 100%;
  background: none;
  border: none;
  border-right: 1px solid #313244;
  color: #a6adc8;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  min-width: 80px;
  user-select: none;
}

.tab-bar__tab:hover {
  background: #313244;
}

.tab-bar__tab--active {
  background: #1e1e2e;
  color: #cdd6f4;
  border-bottom: 2px solid #89b4fa;
}

.tab-bar__tab-title {
  flex: 1;
  text-align: left;
}

.tab-bar__close {
  background: none;
  border: none;
  color: #585b70;
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  border-radius: 2px;
}

.tab-bar__close:hover {
  color: #f38ba8;
  background: #313244;
}

.tab-bar__empty {
  padding: 0 16px;
  font-size: 12px;
  color: #45475a;
  font-style: italic;
}
</style>
