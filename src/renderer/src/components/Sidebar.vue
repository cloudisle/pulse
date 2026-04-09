<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useProfileStore } from '@renderer/stores/profile'
import { useTemplateStore } from '@renderer/stores/template.store'
import { useSessionStore } from '@renderer/stores/session.store'
import { useOpenApiImportStore } from '@renderer/stores/openapi-import.store'
import OpenApiImportModal from '@renderer/components/OpenApiImport/OpenApiImportModal.vue'

const uiStore = useUiStore()
const systemStore = useSystemStore()
const schemaStore = useSchemaStore()
const environmentStore = useEnvironmentStore()
const profileStore = useProfileStore()
const templateStore = useTemplateStore()
const sessionStore = useSessionStore()
const openApiImportStore = useOpenApiImportStore()

const sectionExpanded = ref({
  schemas: true,
  environments: true,
  profiles: true,
  templates: true,
  customTypes: true
})

interface CustomTypeItem {
  id: string
  name: string
}

const customTypes = ref<CustomTypeItem[]>([])

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  entityType: 'schema' | 'environment' | 'profile' | 'template' | 'system' | 'custom-type' | ''
  entityId: string
}

const contextMenu = ref<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  entityType: '',
  entityId: ''
})

onMounted(async () => {
  if (systemStore.systems.length === 0) {
    await systemStore.loadSystems()
  }
})

watch(
  () => systemStore.selectedSystemId,
  async (systemId) => {
    if (!systemId) {
      customTypes.value = []
      return
    }
    await loadCustomTypes(systemId)
  }
)

async function onSystemChange(event: Event): Promise<void> {
  const id = (event.target as HTMLSelectElement).value
  if (!id) return
  systemStore.selectSystem(id)
  await Promise.all([
    schemaStore.list(id),
    environmentStore.list(id),
    profileStore.list(id),
    templateStore.list(id),
    loadCustomTypes(id),
    sessionStore.loadSessions(id)
  ])
}

async function loadCustomTypes(systemId: string): Promise<void> {
  const api = (window as any).app?.api
  if (!api) return
  try {
    const types = await api.customTypes.list(systemId)
    customTypes.value = types.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name }))
  } catch {
    customTypes.value = []
  }
}

function openSchemaTab(id: string, name: string): void {
  uiStore.openTab({ id: `schema:${id}`, type: 'schema', title: name })
}

function openEnvironmentTab(id: string, name: string): void {
  uiStore.openTab({ id: `environment:${id}`, type: 'environment', title: name })
}

function openProfileTab(id: string, name: string): void {
  uiStore.openTab({ id: `profile:${id}`, type: 'profile', title: name })
}

function openTemplateTab(id: string, name: string): void {
  uiStore.openTab({ id: `template:${id}`, type: 'template', title: name })
}

function openCustomTypeTab(id: string, name: string): void {
  uiStore.openTab({ id: `custom-type:${id}`, type: 'custom-type', title: name })
}

function createCustomType(): void {
  uiStore.openTab({ id: 'custom-type:new', type: 'custom-type', title: 'New Custom Type' })
}

function createSystem(): void {
  uiStore.openTab({ id: 'system:new', type: 'system', title: 'New System' })
}

function editSystem(id: string, name: string): void {
  uiStore.openTab({ id: `system:${id}`, type: 'system', title: name })
}

function createSchema(): void {
  uiStore.openTab({ id: 'schema:new', type: 'schema', title: 'New Schema' })
}

function createEnvironment(): void {
  uiStore.openTab({ id: 'environment:new', type: 'environment', title: 'New Environment' })
}

function createProfile(): void {
  uiStore.openTab({ id: 'profile:new', type: 'profile', title: 'New Profile' })
}

function createTemplate(): void {
  uiStore.openTab({ id: 'template:new', type: 'template', title: 'New Template' })
}

function openTemplateBrowser(): void {
  uiStore.openTab({ id: 'template-browser', type: 'template-browser', title: 'Templates' })
}

function openSettingsTab(): void {
  uiStore.openTab({ id: 'settings', type: 'settings', title: 'Settings' })
}

function openSessionsTab(): void {
  uiStore.openTab({ id: 'sessions', type: 'sessions', title: 'Sessions' })
}

function openEventSender(): void {
  uiStore.openTab({ id: 'event-sender', type: 'event-sender', title: 'Send Event' })
}

function showContextMenu(
  event: MouseEvent,
  type: 'schema' | 'environment' | 'profile' | 'template' | 'system' | 'custom-type',
  id: string
): void {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, entityType: type, entityId: id }
  document.addEventListener('click', hideContextMenu)
}

function hideContextMenu(): void {
  contextMenu.value.visible = false
  document.removeEventListener('click', hideContextMenu)
}

function onContextMenuEdit(): void {
  if (contextMenu.value.entityType === 'system') {
    const sys = systemStore.systems.find((s) => s.id === contextMenu.value.entityId)
    if (sys) editSystem(sys.id, sys.name)
  } else if (contextMenu.value.entityType === 'schema') {
    const schema = schemaStore.schemas.find((s) => s.id === contextMenu.value.entityId)
    if (schema) openSchemaTab(schema.id, schema.name)
  }
  hideContextMenu()
}

async function onContextMenuDelete(): Promise<void> {
  const { entityType, entityId } = contextMenu.value
  hideContextMenu()

  if (entityType !== 'schema') return

  const schema = schemaStore.schemas.find((s) => s.id === entityId)
  const schemaName = schema?.name ?? entityId
  const systemId = systemStore.selectedSystemId
  const api = (window as any).app?.api
  if (!systemId || !api) return

  let warningText = `Delete schema "${schemaName}"? This action cannot be undone.`
  try {
    const templates = await api.templates?.list(systemId)
    const references = (templates ?? []).filter((t: any) => t.schemaId === entityId)
    if (references.length > 0) {
      warningText = `Warning: ${references.length} template(s) reference this schema. Deleting it may break those templates.\n\n${warningText}`
    }
  } catch {
    // Ignore reference lookup errors and keep standard confirmation.
  }

  if (!confirm(warningText)) return

  try {
    await schemaStore.deleteSchema(systemId, entityId)
    uiStore.closeTab(`schema:${entityId}`)
  } catch {
    // Keep context menu behavior simple; editors show richer error states.
  }
}

function onContextMenuSyncSchema(): void {
  if (contextMenu.value.entityType !== 'schema') {
    hideContextMenu()
    return
  }

  const schema = schemaStore.schemas.find((s) => s.id === contextMenu.value.entityId)
  hideContextMenu()
  if (!schema) return

  openApiImportStore.openForSchemaSync(schema.id, schema.name)
}

interface TreeItem {
  type: 'folder' | 'template'
  id: string
  name: string
  depth: number
}

function buildTemplateList(parentId: string | null, depth: number): TreeItem[] {
  const items: TreeItem[] = []
  for (const folder of templateStore.folders.filter((f) => f.parentId === parentId)) {
    items.push({ type: 'folder', id: folder.id, name: folder.name, depth })
    items.push(...buildTemplateList(folder.id, depth + 1))
  }
  for (const t of templateStore.templates.filter((t) => t.folderId === parentId)) {
    items.push({ type: 'template', id: t.id, name: t.name, depth })
  }
  return items
}

const templateTree = computed<TreeItem[]>(() => buildTemplateList(null, 0))
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
      <!-- Systems selector -->
      <section class="sidebar__section">
        <div class="sidebar__section-header">
          <h3 class="sidebar__section-title">Systems</h3>
          <button class="sidebar__add-btn" title="Create system" @click="createSystem">+</button>
        </div>
        <div class="sidebar__system-selector">
          <select
            class="sidebar__system-select"
            :value="systemStore.selectedSystemId ?? ''"
            @change="onSystemChange"
          >
            <option value="" disabled>Select a system…</option>
            <option v-for="sys in systemStore.systems" :key="sys.id" :value="sys.id">
              {{ sys.name }}
            </option>
          </select>
          <button
            v-if="systemStore.selectedSystemId"
            class="sidebar__edit-btn"
            title="Edit selected system"
            @click="editSystem(systemStore.selectedSystemId!, systemStore.systems.find(s => s.id === systemStore.selectedSystemId)?.name ?? 'System')"
          >
            ✎
          </button>
        </div>
      </section>

      <!-- Send Event -->
      <section class="sidebar__section">
        <button
          class="sidebar__send-event-btn"
          data-testid="send-event-btn"
          @click="openEventSender"
        >
          <svg class="sidebar__icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2 2.75L14 8L2 13.25L5.5 8L2 2.75Z"
              fill="none"
              stroke="currentColor"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
          <span>Send Event</span>
        </button>
      </section>

      <!-- Schemas -->
      <section class="sidebar__section">
        <div class="sidebar__section-header">
          <button
            class="sidebar__section-toggle"
            :aria-expanded="sectionExpanded.schemas"
            @click="sectionExpanded.schemas = !sectionExpanded.schemas"
          >
            {{ sectionExpanded.schemas ? '▾' : '▸' }}
          </button>
          <h3 class="sidebar__section-title">Schemas</h3>
          <button class="sidebar__add-btn" title="Import OpenAPI" data-testid="import-openapi-btn" @click="openApiImportStore.open()">
            <svg class="sidebar__icon" viewBox="0 0 35 35" aria-hidden="true">
              <path d="M17.5,22.131a1.249,1.249,0,0,1-1.25-1.25V2.187a1.25,1.25,0,0,1,2.5,0V20.881A1.25,1.25,0,0,1,17.5,22.131Z" fill="currentColor"/>
              <path d="M17.5,22.693a3.189,3.189,0,0,1-2.262-.936L8.487,15.006a1.249,1.249,0,0,1,1.767-1.767l6.751,6.751a.7.7,0,0,0,.99,0l6.751-6.751a1.25,1.25,0,0,1,1.768,1.767l-6.752,6.751A3.191,3.191,0,0,1,17.5,22.693Z" fill="currentColor"/>
              <path d="M31.436,34.063H3.564A3.318,3.318,0,0,1,.25,30.749V22.011a1.25,1.25,0,0,1,2.5,0v8.738a.815.815,0,0,0,.814.814H31.436a.815.815,0,0,0,.814-.814V22.011a1.25,1.25,0,1,1,2.5,0v8.738A3.318,3.318,0,0,1,31.436,34.063Z" fill="currentColor"/>
            </svg>
          </button>
          <button class="sidebar__add-btn" title="Create schema" data-testid="create-schema-btn" @click="createSchema">+</button>
        </div>
        <ul v-if="sectionExpanded.schemas" class="sidebar__list">
          <li v-if="schemaStore.schemas.length === 0" class="sidebar__empty">No items</li>
          <li
            v-for="schema in schemaStore.schemas"
            :key="schema.id"
            class="sidebar__item"
            @click="openSchemaTab(schema.id, schema.name)"
            @contextmenu.prevent="showContextMenu($event, 'schema', schema.id)"
          >
            {{ schema.name }}
          </li>
        </ul>
      </section>

      <!-- Environments -->
      <section class="sidebar__section">
        <div class="sidebar__section-header">
          <button
            class="sidebar__section-toggle"
            :aria-expanded="sectionExpanded.environments"
            @click="sectionExpanded.environments = !sectionExpanded.environments"
          >
            {{ sectionExpanded.environments ? '▾' : '▸' }}
          </button>
          <h3 class="sidebar__section-title">Environments</h3>
          <button class="sidebar__add-btn" title="Create environment" @click="createEnvironment">+</button>
        </div>
        <ul v-if="sectionExpanded.environments" class="sidebar__list">
          <li v-if="environmentStore.environments.length === 0" class="sidebar__empty">No items</li>
          <li
            v-for="env in environmentStore.environments"
            :key="env.id"
            class="sidebar__item"
            @click="openEnvironmentTab(env.id, env.name)"
            @contextmenu.prevent="showContextMenu($event, 'environment', env.id)"
          >
            {{ env.name }}
          </li>
        </ul>
      </section>

      <!-- Profiles -->
      <section class="sidebar__section">
        <div class="sidebar__section-header">
          <button
            class="sidebar__section-toggle"
            :aria-expanded="sectionExpanded.profiles"
            @click="sectionExpanded.profiles = !sectionExpanded.profiles"
          >
            {{ sectionExpanded.profiles ? '▾' : '▸' }}
          </button>
          <h3 class="sidebar__section-title">Profiles</h3>
          <button class="sidebar__add-btn" title="Create profile" @click="createProfile">+</button>
        </div>
        <ul v-if="sectionExpanded.profiles" class="sidebar__list">
          <li v-if="profileStore.availableProfiles.length === 0" class="sidebar__empty">
            (none) —
            <button class="sidebar__inline-btn" @click="createProfile">create a profile</button>
          </li>
          <li
            v-for="profile in profileStore.availableProfiles"
            :key="profile.id"
            class="sidebar__item"
            @click="openProfileTab(profile.id, profile.name)"
            @contextmenu.prevent="showContextMenu($event, 'profile', profile.id)"
          >
            {{ profile.name }}
          </li>
        </ul>
      </section>

      <!-- Custom Types -->
      <section class="sidebar__section">
        <div class="sidebar__section-header">
          <button
            class="sidebar__section-toggle"
            :aria-expanded="sectionExpanded.customTypes"
            @click="sectionExpanded.customTypes = !sectionExpanded.customTypes"
          >
            {{ sectionExpanded.customTypes ? '▾' : '▸' }}
          </button>
          <h3 class="sidebar__section-title">Custom Types</h3>
          <button class="sidebar__add-btn" title="Create custom type" data-testid="create-custom-type-btn" @click="createCustomType">+</button>
        </div>
        <ul v-if="sectionExpanded.customTypes" class="sidebar__list">
          <li v-if="customTypes.length === 0" class="sidebar__empty">No items</li>
          <li
            v-for="ct in customTypes"
            :key="ct.id"
            class="sidebar__item"
            @click="openCustomTypeTab(ct.id, ct.name)"
            @contextmenu.prevent="showContextMenu($event, 'custom-type', ct.id)"
          >
            {{ ct.name }}
          </li>
        </ul>
      </section>
      

      <!-- Templates -->
      <section class="sidebar__section">
        <div class="sidebar__section-header">
          <button
            class="sidebar__section-toggle"
            :aria-expanded="sectionExpanded.templates"
            @click="sectionExpanded.templates = !sectionExpanded.templates"
          >
            {{ sectionExpanded.templates ? '▾' : '▸' }}
          </button>
          <h3 class="sidebar__section-title sidebar__section-title--clickable" @click="openTemplateBrowser">Templates</h3>
          <button class="sidebar__add-btn" title="Browse templates" @click="openTemplateBrowser">
            <svg class="sidebar__icon" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2.5 3.5H7L8.5 5H13.5V12.5H2.5V3.5Z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
              />
            </svg>
          </button>
          <button class="sidebar__add-btn" title="Create template" @click="createTemplate">+</button>
        </div>
        <ul v-if="sectionExpanded.templates" class="sidebar__list">
          <li
            v-if="templateStore.folders.length === 0 && templateStore.templates.length === 0"
            class="sidebar__empty"
          >
            No items
          </li>
          <li
            v-for="item in templateTree"
            :key="`${item.type}:${item.id}`"
            class="sidebar__item"
            :class="{ 'sidebar__item--folder': item.type === 'folder' }"
            :style="{ paddingLeft: `${16 + item.depth * 12}px` }"
            @click="item.type === 'template' && openTemplateTab(item.id, item.name)"
            @contextmenu.prevent="
              item.type === 'template' && showContextMenu($event, 'template', item.id)
            "
          >
            <svg v-if="item.type === 'folder'" class="sidebar__icon sidebar__folder-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2.5 3.5H7L8.5 5H13.5V12.5H2.5V3.5Z"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
              />
            </svg>
            {{ item.name }}
          </li>
        </ul>
      </section>
    </nav>

    <!-- Settings button -->
    <div v-if="!uiStore.sidebarCollapsed" class="sidebar__footer">
      <button
        class="sidebar__settings-btn"
        title="Open sessions"
        data-testid="sessions-btn"
        @click="openSessionsTab"
      >
        <svg class="sidebar__icon" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 2.5H12V13.5H4V2.5Z"
            fill="none"
            stroke="currentColor"
            stroke-linejoin="round"
            stroke-width="1.5"
          />
          <path
            d="M6 5.5H10M6 8H10M6 10.5H9"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.5"
          />
        </svg>
        <span>Sessions</span>
      </button>
      <button
        class="sidebar__settings-btn"
        title="Open settings"
        data-testid="settings-btn"
        @click="openSettingsTab"
      >
        <svg class="sidebar__icon" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 5.5A2.5 2.5 0 1 1 8 10.5A2.5 2.5 0 0 1 8 5.5Z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          />
          <path
            d="M8 2.5V4M8 12V13.5M3.4 4.1L4.5 5.2M11.5 10.8L12.6 11.9M2.5 8H4M12 8H13.5M3.4 11.9L4.5 10.8M11.5 5.2L12.6 4.1"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-width="1.5"
          />
        </svg>
        <span>Settings</span>
      </button>
    </div>

    <!-- Context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="sidebar__context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        @click.stop
      >
        <button class="sidebar__context-item" @click="onContextMenuEdit">Edit</button>
        <button
          v-if="contextMenu.entityType === 'schema'"
          class="sidebar__context-item"
          @click="onContextMenuSyncSchema"
        >
          Sync from OpenAPI
        </button>
        <button class="sidebar__context-item" @click="onContextMenuDelete">Delete</button>
        <button
          v-if="contextMenu.entityType === 'template'"
          class="sidebar__context-item"
          @click="hideContextMenu"
        >
          Move
        </button>
      </div>
      <OpenApiImportModal v-if="openApiImportStore.isOpen" />
    </Teleport>
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

.sidebar__section-header {
  display: flex;
  align-items: center;
  padding: 4px 8px 4px 4px;
  gap: 2px;
}

.sidebar__section-toggle {
  background: none;
  border: none;
  color: #585b70;
  font-size: 10px;
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
}

.sidebar__section-toggle:hover {
  color: #a6adc8;
}

.sidebar__section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #585b70;
  margin: 0;
  flex: 1;
  padding: 4px 12px;
}

.sidebar__section > .sidebar__section-title {
  padding: 4px 12px;
}

.sidebar__section-header .sidebar__section-title {
  padding: 0;
}

.sidebar__add-btn {
  background: none;
  border: none;
  color: #585b70;
  font-size: 16px;
  cursor: pointer;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  padding: 0;
  flex-shrink: 0;
}

.sidebar__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

.sidebar__add-btn:hover {
  background: #313244;
  color: #cdd6f4;
}

.sidebar__system-selector {
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar__edit-btn {
  background: none;
  border: none;
  color: #585b70;
  font-size: 14px;
  cursor: pointer;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
  padding: 0;
}

.sidebar__edit-btn:hover {
  background: #313244;
  color: #cdd6f4;
}

.sidebar__system-select {
  width: 100%;
  background: #1e1e2e;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
  outline: none;
}

.sidebar__system-select:focus {
  border-color: #89b4fa;
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

.sidebar__inline-btn {
  background: none;
  border: none;
  color: #89b4fa;
  font-size: 12px;
  font-style: italic;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.sidebar__inline-btn:hover {
  color: #b4befe;
}

.sidebar__item {
  padding: 4px 16px;
  font-size: 12px;
  color: #cdd6f4;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar__item:hover {
  background: #313244;
}

.sidebar__item--folder {
  color: #89b4fa;
  font-weight: 500;
}

.sidebar__folder-icon {
  width: 13px;
  height: 13px;
}

.sidebar__section-title--clickable {
  cursor: pointer;
}

.sidebar__section-title--clickable:hover {
  color: #89b4fa;
}

.sidebar__send-event-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #313244;
  border: 1px solid #45475a;
  color: #89b4fa;
  font-size: 12px;
  font-weight: 600;
  padding: 7px 12px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  margin: 4px 8px;
  width: calc(100% - 16px);
}

.sidebar__send-event-btn:hover {
  background: #45475a;
  color: #b4befe;
}

.sidebar__footer {
  padding: 8px;
  border-top: 1px solid #313244;
  flex-shrink: 0;
}

.sidebar__settings-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #585b70;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 8px;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  width: 100%;
}

.sidebar__settings-btn:hover {
  background: #313244;
  color: #a6adc8;
}
</style>

<style>
.sidebar__context-menu {
  position: fixed;
  z-index: 9999;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 120px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.sidebar__context-item {
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: #cdd6f4;
  font-size: 13px;
  padding: 6px 14px;
  text-align: left;
  cursor: pointer;
}

.sidebar__context-item:hover {
  background: #45475a;
}
</style>
