<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import Console from '@renderer/components/BottomPanel/Console.vue'

const uiStore = useUiStore()
const activeSubTab = ref<'console' | 'listeners'>('console')

const dragStartY = ref(0)
const dragStartHeight = ref(0)

function onDragStart(e: MouseEvent): void {
  dragStartY.value = e.clientY
  dragStartHeight.value = uiStore.bottomPanelHeight
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent): void {
  const delta = dragStartY.value - e.clientY
  const newHeight = Math.max(80, Math.min(600, dragStartHeight.value + delta))
  uiStore.setBottomPanelHeight(newHeight)
}

function onDragEnd(): void {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}
</script>

<template>
  <div
    class="bottom-panel"
    :class="{ 'bottom-panel--collapsed': uiStore.bottomPanelCollapsed }"
    :style="!uiStore.bottomPanelCollapsed ? { height: uiStore.bottomPanelHeight + 'px' } : {}"
  >
    <div class="bottom-panel__resize-handle" @mousedown="onDragStart" />
    <div class="bottom-panel__header">
      <div class="bottom-panel__tabs" role="tablist">
        <button
          class="bottom-panel__tab"
          :class="{ 'bottom-panel__tab--active': activeSubTab === 'console' }"
          role="tab"
          :aria-selected="activeSubTab === 'console'"
          @click="activeSubTab = 'console'"
        >Console</button>
        <button
          class="bottom-panel__tab"
          :class="{ 'bottom-panel__tab--active': activeSubTab === 'listeners' }"
          role="tab"
          :aria-selected="activeSubTab === 'listeners'"
          @click="activeSubTab = 'listeners'"
        >Listeners</button>
      </div>
      <button
        class="bottom-panel__toggle"
        :aria-label="uiStore.bottomPanelCollapsed ? 'Expand bottom panel' : 'Collapse bottom panel'"
        :aria-expanded="!uiStore.bottomPanelCollapsed"
        @click="uiStore.toggleBottomPanel()"
      >
        {{ uiStore.bottomPanelCollapsed ? '▲' : '▼' }}
      </button>
    </div>
    <div v-if="!uiStore.bottomPanelCollapsed" class="bottom-panel__content">
      <div v-if="activeSubTab === 'console'" class="bottom-panel__console">
        <Console />
      </div>
      <div v-else class="bottom-panel__listeners">
        <p class="bottom-panel__placeholder">Active listeners will appear here.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bottom-panel {
  display: flex;
  flex-direction: column;
  background: #181825;
  border-top: 1px solid #313244;
  flex-shrink: 0;
  overflow: hidden;
}

.bottom-panel--collapsed {
  height: 32px !important;
}

.bottom-panel__resize-handle {
  height: 4px;
  cursor: ns-resize;
  background: transparent;
  flex-shrink: 0;
}

.bottom-panel__resize-handle:hover {
  background: #45475a;
}

.bottom-panel__header {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px;
  flex-shrink: 0;
  gap: 4px;
}

.bottom-panel__tabs {
  display: flex;
  gap: 2px;
  flex: 1;
}

.bottom-panel__tab {
  padding: 0 12px;
  height: 26px;
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px 4px 0 0;
}

.bottom-panel__tab:hover {
  background: #313244;
}

.bottom-panel__tab--active {
  background: #1e1e2e;
  color: #cdd6f4;
  border-bottom: 2px solid #89b4fa;
}

.bottom-panel__toggle {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.bottom-panel__toggle:hover {
  background: #313244;
}

.bottom-panel__content {
  flex: 1;
  overflow: hidden;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
}

.bottom-panel__console {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bottom-panel__placeholder {
  font-size: 12px;
  color: #585b70;
  font-style: italic;
  margin: 0;
}
</style>
