<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import Console from '@renderer/components/BottomPanel/Console.vue'

const uiStore = useUiStore()

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
      <h3 class="bottom-panel__title">Console</h3>
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
      <Console />
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
  justify-content: space-between;
  height: 28px;
  padding: 0 8px;
  flex-shrink: 0;
  gap: 4px;
  border-bottom: 1px solid #313244;
}

.bottom-panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #cdd6f4;
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
</style>
