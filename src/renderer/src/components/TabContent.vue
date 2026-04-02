<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import SystemEditor from '@renderer/components/SystemEditor/SystemEditor.vue'
import SchemaEditor from '@renderer/components/SchemaEditor/SchemaEditor.vue'
import EventSender from '@renderer/components/EventSender/EventSender.vue'
import CustomTypeEditor from '@renderer/components/CustomTypeEditor/CustomTypeEditor.vue'
import SessionView from '@renderer/components/SessionView/SessionView.vue'
import SessionsView from '@renderer/components/SessionView/SessionsView.vue'
import ProfileEditor from '@renderer/components/ProfileEditor/ProfileEditor.vue'
import SettingsView from '@renderer/components/Settings/SettingsView.vue'
import EnvironmentEditor from '@renderer/components/EnvironmentEditor/EnvironmentEditor.vue'
import TemplateBrowser from '@renderer/components/TemplateBrowser/TemplateBrowser.vue'
import TemplateEditor from '@renderer/components/TemplateEditor/TemplateEditor.vue'

const uiStore = useUiStore()

const activeTab = computed(() => uiStore.openTabs.find((t) => t.id === uiStore.activeTabId))

type ActiveView = {
  component:
    | typeof SystemEditor
    | typeof SchemaEditor
    | typeof EventSender
    | typeof ProfileEditor
    | typeof EnvironmentEditor
    | typeof CustomTypeEditor
    | typeof SessionView
    | typeof SessionsView
    | typeof SettingsView
    | typeof TemplateBrowser
    | typeof TemplateEditor
  props: Record<string, unknown>
}

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

function customTypeIdFromTab(tabId: string): string | undefined {
  // tabId is "custom-type:new" or "custom-type:<uuid>"
  const part = tabId.replace(/^custom-type:/, '')
  return part === 'new' ? undefined : part
}
  
function sessionIdFromTab(tabId: string): string {
  // tabId is "session:<uuid>"
  return tabId.replace(/^session:/, '')
}
  
function profileIdFromTab(tabId: string): string | undefined {
  // tabId is "profile:new" or "profile:<uuid>"
  const part = tabId.replace(/^profile:/, '')
  return part === 'new' ? undefined : part
}
  
function templateIdFromTab(tabId: string): string | undefined {
  // tabId is "template:new" or "template:<uuid>"
  const part = tabId.replace(/^template:/, '')
  return part === 'new' ? undefined : part
}

function environmentIdFromTab(tabId: string): string | undefined {
  // tabId is "environment:new" or "environment:<uuid>"
  const part = tabId.replace(/^environment:/, '')
  return part === 'new' ? undefined : part
}

const activeView = computed<ActiveView | null>(() => {
  const tab = activeTab.value
  if (!tab) return null

  switch (tab.type) {
    case 'system':
      return { component: SystemEditor, props: { systemId: systemIdFromTab(tab.id) } }
    case 'schema':
      return { component: SchemaEditor, props: { schemaId: schemaIdFromTab(tab.id) } }
    case 'event-sender':
      return { component: EventSender, props: {} }
    case 'profile':
      return { component: ProfileEditor, props: { profileId: profileIdFromTab(tab.id) } }
    case 'environment':
      return { component: EnvironmentEditor, props: { environmentId: environmentIdFromTab(tab.id) } }
    case 'custom-type':
      return { component: CustomTypeEditor, props: { customTypeId: customTypeIdFromTab(tab.id) } }
    case 'session':
      return { component: SessionView, props: { sessionId: sessionIdFromTab(tab.id) } }
    case 'sessions':
      return { component: SessionsView, props: {} }
    case 'settings':
      return { component: SettingsView, props: {} }
    case 'template-browser':
      return { component: TemplateBrowser, props: {} }
    case 'template':
      return { component: TemplateEditor, props: { templateId: templateIdFromTab(tab.id) } }
    default:
      return null
  }
})
</script>

<template>
  <div class="tab-content">
    <div v-if="activeTab" class="tab-content__view">
      <KeepAlive>
        <component
          :is="activeView?.component"
          v-if="activeView"
          :key="activeTab.id"
          v-bind="activeView.props"
        />
      </KeepAlive>
      <p v-if="!activeView" class="tab-content__placeholder">{{ activeTab.title }} ({{ activeTab.type }})</p>
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
