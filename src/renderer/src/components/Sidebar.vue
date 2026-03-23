<script setup lang="ts">
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()

const sections = ['Systems', 'Schemas', 'Environments', 'Profiles', 'Templates'] as const
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': uiStore.sidebarCollapsed }">
    <button
      class="sidebar__toggle"
      :aria-label="uiStore.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      :aria-expanded="!uiStore.sidebarCollapsed"
      @click="uiStore.toggleSidebar()"
    >
      {{ uiStore.sidebarCollapsed ? '›' : '‹' }}
    </button>
    <nav v-if="!uiStore.sidebarCollapsed" class="sidebar__nav">
      <section
        v-for="section in sections"
        :key="section"
        class="sidebar__section"
      >
        <h3 class="sidebar__section-title">{{ section }}</h3>
        <ul class="sidebar__list">
          <li class="sidebar__empty">No items</li>
        </ul>
      </section>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 220px;
  background: #181825;
  border-right: 1px solid #313244;
  flex-shrink: 0;
  transition: width 0.2s ease;
  overflow: hidden;
  position: relative;
}

.sidebar--collapsed {
  width: 32px;
}

.sidebar__toggle {
  position: absolute;
  top: 8px;
  right: 4px;
  z-index: 1;
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 18px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  padding: 0;
}

.sidebar__toggle:hover {
  background: #313244;
}

.sidebar__nav {
  margin-top: 40px;
  overflow-y: auto;
  flex: 1;
}

.sidebar__section {
  padding: 8px 0;
  border-bottom: 1px solid #313244;
}

.sidebar__section-title {
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #585b70;
  margin: 0;
}

.sidebar__list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
}

.sidebar__empty {
  padding: 4px 16px;
  font-size: 12px;
  color: #45475a;
  font-style: italic;
}
</style>
