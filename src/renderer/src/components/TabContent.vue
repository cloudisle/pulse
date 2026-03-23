<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()

const activeTab = computed(() => uiStore.openTabs.find((t) => t.id === uiStore.activeTabId))
</script>

<template>
  <div class="tab-content">
    <div v-if="activeTab" class="tab-content__view">
      <p class="tab-content__placeholder">{{ activeTab.title }} ({{ activeTab.type }})</p>
    </div>
    <div v-else class="tab-content__empty">
      <p>Select an item from the sidebar to open it here.</p>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  flex: 1;
  overflow: auto;
  background: #1e1e2e;
  color: #cdd6f4;
}

.tab-content__view {
  padding: 24px;
}

.tab-content__placeholder {
  font-size: 14px;
  color: #a6adc8;
}

.tab-content__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #585b70;
  font-size: 14px;
}
</style>
