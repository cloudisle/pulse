<script setup lang="ts">
import { ref } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import ListenerPanel from '@renderer/components/Listeners/ListenerPanel.vue'

const uiStore = useUiStore()

const dragStartX = ref(0)
const dragStartWidth = ref(0)

function onDragStart(e: MouseEvent): void {
  dragStartX.value = e.clientX
  dragStartWidth.value = uiStore.rightSidebarWidth
  window.addEventListener('mousemove', onDragMove)
  window.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent): void {
  const delta = dragStartX.value - e.clientX
  const newWidth = Math.max(200, Math.min(800, dragStartWidth.value + delta))
  uiStore.setRightSidebarWidth(newWidth)
}

function onDragEnd(): void {
  window.removeEventListener('mousemove', onDragMove)
  window.removeEventListener('mouseup', onDragEnd)
}
</script>

<template>
  <div
    class="right-sidebar"
    :class="{ 'right-sidebar--collapsed': uiStore.rightSidebarCollapsed }"
    :style="!uiStore.rightSidebarCollapsed ? { width: uiStore.rightSidebarWidth + 'px' } : {}"
  >
    <div class="right-sidebar__toggle-button" @click="uiStore.toggleRightSidebar()" :aria-label="uiStore.rightSidebarCollapsed ? 'Open listeners' : 'Close listeners'" :aria-expanded="!uiStore.rightSidebarCollapsed">
      {{ uiStore.rightSidebarCollapsed ? '◄' : '►' }}
    </div>
    <div v-if="!uiStore.rightSidebarCollapsed" class="right-sidebar__content">
      <div class="right-sidebar__header">
        <h3 class="right-sidebar__title">Listeners</h3>
      </div>
      <div class="right-sidebar__panel">
        <ListenerPanel />
      </div>
      <div class="right-sidebar__resize-handle" @mousedown="onDragStart" />
    </div>
  </div>
</template>

<style scoped>
.right-sidebar {
  display: flex;
  flex-direction: column;
  background: #181825;
  border-left: 1px solid #313244;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
}

.right-sidebar--collapsed {
  width: 32px !important;
}

.right-sidebar__toggle-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.right-sidebar__toggle-button:hover {
  background: #313244;
}

.right-sidebar__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  position: relative;
}

.right-sidebar__header {
  padding: 8px 12px;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.right-sidebar__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #cdd6f4;
}

.right-sidebar__panel {
  flex: 1;
  overflow: hidden;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
}

.right-sidebar__resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: ew-resize;
  background: transparent;
}

.right-sidebar__resize-handle:hover {
  background: #45475a;
}
</style>

