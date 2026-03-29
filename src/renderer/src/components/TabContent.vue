<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import SystemEditor from '@renderer/components/SystemEditor/SystemEditor.vue'
import SchemaEditor from '@renderer/components/SchemaEditor/SchemaEditor.vue'
import EventSender from '@renderer/components/EventSender/EventSender.vue'
import SessionView from '@renderer/components/SessionView/SessionView.vue'
import SettingsView from '@renderer/components/Settings/SettingsView.vue'
import EnvironmentEditor from '@renderer/components/EnvironmentEditor/EnvironmentEditor.vue'

const uiStore = useUiStore()

const activeTab = computed(() => uiStore.openTabs.find((t) => t.id === uiStore.activeTabId))

function systemIdFromTab(tabId: string): string | undefined {
  // tabId is "system:new" or "system:<uuid>"
  const part = tabId.replace(/^system:/, '')
  return part === 'new' ? undefined : part
}

function schemaIdFromTab(tabId: string): string | undefined {
  // tabId is "schema:new" or "schema:<uuid>"
  const part = tabId.replace(/^schema:/, '')
  return part === 'new' ? undefined : part
}

function sessionIdFromTab(tabId: string): string {
  // tabId is "session:<uuid>"
  return tabId.replace(/^session:/, '')
}
  
function environmentIdFromTab(tabId: string): string | undefined {
  // tabId is "environment:new" or "environment:<uuid>"
  const part = tabId.replace(/^environment:/, '')
  return part === 'new' ? undefined : part
}
</script>

<template>
  <div class="tab-content">
    <div v-if="activeTab" class="tab-content__view">
      <SystemEditor
        v-if="activeTab.type === 'system'"
        :system-id="systemIdFromTab(activeTab.id)"
      />
      <SchemaEditor
        v-else-if="activeTab.type === 'schema'"
        :schema-id="schemaIdFromTab(activeTab.id)"
      />
      <EventSender
        v-else-if="activeTab.type === 'event-sender'"
      />
      <EnvironmentEditor
        v-else-if="activeTab.type === 'environment'"
        :environment-id="environmentIdFromTab(activeTab.id)"
      />
      <SessionView
        v-else-if="activeTab.type === 'session'"
        :session-id="sessionIdFromTab(activeTab.id)"
      />
      <SettingsView
        v-else-if="activeTab.type === 'settings'"
      />
      <p v-else class="tab-content__placeholder">{{ activeTab.title }} ({{ activeTab.type }})</p>
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
