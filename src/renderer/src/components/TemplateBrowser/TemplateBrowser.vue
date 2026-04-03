<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, watch, toRaw} from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useSystemStore } from '@renderer/stores/system'
import { useTemplateStore } from '@renderer/stores/template.store'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useProfileStore } from '@renderer/stores/profile'
import { useSessionStore } from '@renderer/stores/session.store'
import type { Template } from '../../../../shared/models/template'
import type { InputConfig } from '../../../../shared/models/system'
import {resolveCloudSettings} from "@renderer/util/cloud";

const uiStore = useUiStore()
const systemStore = useSystemStore()
const templateStore = useTemplateStore()
const schemaStore = useSchemaStore()
const profileStore = useProfileStore()
const sessionStore = useSessionStore()

// ─── Selection state ─────────────────────────────────────────────────────────

const selectedFolderId = ref<string | null>(null) // null = root
const selectedTemplateId = ref<string | null>(null)
const selectedTemplate = ref<Template | null>(null)
const expandedFolders = ref<Set<string>>(new Set())
const inputs = ref<InputConfig[]>([])

// ─── Action state ─────────────────────────────────────────────────────────────

const sendResult = ref<{ success: boolean; error?: string } | null>(null)
const generating = ref(false)
const sending = ref(false)
const previewJson = ref<string | null>(null)
const errorMessage = ref('')

// ─── Context menu ─────────────────────────────────────────────────────────────

const contextMenu = ref<{
  visible: boolean
  x: number
  y: number
  type: 'folder' | 'template' | ''
  id: string
  name: string
}>({ visible: false, x: 0, y: 0, type: '', id: '', name: '' })

// ─── Dialogs ─────────────────────────────────────────────────────────────────

const newFolderDialog = ref<{
  visible: boolean
  name: string
  parentId: string | null
}>({ visible: false, name: '', parentId: null })

const deleteConfirm = ref<{
  visible: boolean
  type: 'folder' | 'template' | ''
  id: string
  name: string
}>({ visible: false, type: '', id: '', name: '' })

// ─── Drag-and-drop ────────────────────────────────────────────────────────────

const draggingTemplateId = ref<string | null>(null)
const dragOverFolderId = ref<string | null>(null)
const isDraggingOver = ref(false)

// ─── Panel resize ────────────────────────────────────────────────────────────

const bodyRef = ref<HTMLElement | null>(null)
const treeWidth = ref(200)
const listWidth = ref(220)
const resizingPane = ref<'tree' | 'list' | null>(null)
const resizeStartX = ref(0)
const resizeStartTreeWidth = ref(200)
const resizeStartListWidth = ref(220)

const TREE_MIN_WIDTH = 140
const TREE_MAX_WIDTH = 420
const LIST_MIN_WIDTH = 160
const LIST_MAX_WIDTH = 520
const DETAIL_MIN_WIDTH = 260

// ─── Folder tree (flat, with expand/collapse) ─────────────────────────────────

interface FolderTreeItem {
  id: string
  name: string
  parentId: string | null
  depth: number
  hasChildren: boolean
}

function buildFlatFolderList(parentId: string | null, depth: number): FolderTreeItem[] {
  const items: FolderTreeItem[] = []
  for (const folder of templateStore.folders.filter((f) => f.parentId === parentId)) {
    const hasChildren = templateStore.folders.some((f) => f.parentId === folder.id)
    items.push({ id: folder.id, name: folder.name, parentId: folder.parentId, depth, hasChildren })
    if (expandedFolders.value.has(folder.id)) {
      items.push(...buildFlatFolderList(folder.id, depth + 1))
    }
  }
  return items
}

const flatFolderTree = computed(() => buildFlatFolderList(null, 0))

const templatesInSelectedFolder = computed(() =>
  templateStore.templates.filter((t) => t.folderId === selectedFolderId.value)
)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSchemaName(schemaId: string): string {
  return schemaStore.schemas.find((s) => s.id === schemaId)?.name ?? schemaId
}

function getInputName(inputId: string): string {
  const input = inputs.value.find((i) => i.id === inputId)
  return input ? `${input.name} (${input.type})` : inputId
}

function getProfileName(profileId: string): string {
  return profileStore.availableProfiles.find((p) => p.id === profileId)?.name ?? profileId
}

// ─── Load ─────────────────────────────────────────────────────────────────────

async function loadInputs(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return
  try {
    const system = await api.systems.get(systemId)
    inputs.value = system.inputs ?? []
  } catch {
    inputs.value = []
  }
}

async function refreshAll(systemId: string): Promise<void> {
  await Promise.all([
    templateStore.list(systemId),
    loadInputs(),
    schemaStore.list(systemId),
    profileStore.list(systemId)
  ])
}

onMounted(async () => {
  const systemId = systemStore.selectedSystemId
  if (systemId) await refreshAll(systemId)
})

watch(
  () => systemStore.selectedSystemId,
  async (id) => {
    if (id) {
      await refreshAll(id)
      selectedFolderId.value = null
      selectedTemplateId.value = null
      selectedTemplate.value = null
    }
  }
)

// ─── Selection ────────────────────────────────────────────────────────────────

function selectFolder(id: string | null): void {
  selectedFolderId.value = id
  selectedTemplateId.value = null
  selectedTemplate.value = null
  sendResult.value = null
  previewJson.value = null
  errorMessage.value = ''
}

function toggleFolderExpand(id: string): void {
  if (expandedFolders.value.has(id)) {
    expandedFolders.value.delete(id)
  } else {
    expandedFolders.value.add(id)
  }
  // Force reactivity
  expandedFolders.value = new Set(expandedFolders.value)
}

async function selectTemplate(id: string): Promise<void> {
  selectedTemplateId.value = id
  selectedTemplate.value = null
  sendResult.value = null
  previewJson.value = null
  errorMessage.value = ''

  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return

  try {
    selectedTemplate.value = await api.templates.get(systemId, id)
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Failed to load template.'
  }
}

// ─── Tab actions ──────────────────────────────────────────────────────────────

function openSchemaTab(schemaId: string): void {
  uiStore.openTab({ id: `schema:${schemaId}`, type: 'schema', title: getSchemaName(schemaId) })
}

function editTemplate(id: string, name: string): void {
  uiStore.openTab({ id: `template:${id}`, type: 'template', title: name })
}

function newTemplate(): void {
  uiStore.openTab({ id: 'template:new', type: 'template', title: 'New Template' })
}

// ─── Generate preview ─────────────────────────────────────────────────────────

async function generatePreview(): Promise<void> {
  if (!selectedTemplate.value) return
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  if (!sessionStore.selectedSessionId) {
    sendResult.value = { success: false, error: 'Select a session from the top bar first.' }
    return
  }
  const api = (window as any).app?.api
  if (!api) return

  generating.value = true
  errorMessage.value = ''
  previewJson.value = null

  try {
    const overrides: Record<string, any> = {}
    for (const field of selectedTemplate.value.fields ?? []) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    const event = await api.events.generate(toRaw(systemId), {
      schemaId: toRaw(selectedTemplate.value.schemaId),
      profileIds: toRaw(selectedTemplate.value.profileIds),
      overrides
    })

    previewJson.value = JSON.stringify(event.payload, null, 2)
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Failed to generate preview.'
  } finally {
    generating.value = false
  }
}

// ─── Quick-send ───────────────────────────────────────────────────────────────

async function quickSend(): Promise<void> {
  if (!selectedTemplate.value) return
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return

  sending.value = true
  errorMessage.value = ''
  sendResult.value = null

  try {
    const overrides: Record<string, any> = {}
    for (const field of selectedTemplate.value.fields ?? []) {
      if (!field.omitted && field.value !== undefined) {
        overrides[field.elementPath] = field.value
      }
    }

    // Generate the event
    const event = await api.events.generate(toRaw(systemId), {
      schemaId: toRaw(selectedTemplate.value.schemaId),
      profileIds: toRaw(selectedTemplate.value.profileIds),
      overrides
    })

    previewJson.value = JSON.stringify(event.payload, null, 2)

    // Send
    const result = await api.events.send(toRaw(systemId), {
      inputId: toRaw(selectedTemplate.value.inputId),
      sessionId: toRaw(sessionStore.selectedSessionId),
      event: {
        schemaId: toRaw(event.schemaId),
        payload: toRaw(event.payload),
        appliedProfiles: toRaw(event.appliedProfiles)
      },
      cloud: toRaw(resolveCloudSettings())
    })

    sendResult.value = result
  } catch (err: any) {
    sendResult.value = { success: false, error: err?.message ?? 'Failed to send.' }
  } finally {
    sending.value = false
  }
}

// ─── New folder ───────────────────────────────────────────────────────────────

function openNewFolderDialog(parentId: string | null): void {
  newFolderDialog.value = { visible: true, name: '', parentId }
  hideContextMenu()
}

async function createFolder(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId || !newFolderDialog.value.name.trim()) return
  const api = (window as any).app?.api
  if (!api) return

  try {
    await api.templates.createFolder(
      systemId,
      newFolderDialog.value.name.trim(),
      newFolderDialog.value.parentId
    )
    await templateStore.list(systemId)
    newFolderDialog.value.visible = false
    newFolderDialog.value.name = ''
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Failed to create folder.'
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

function openDeleteConfirm(type: 'folder' | 'template', id: string, name: string): void {
  deleteConfirm.value = { visible: true, type, id, name }
  hideContextMenu()
}

async function confirmDelete(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return

  try {
    if (deleteConfirm.value.type === 'folder') {
      await api.templates.deleteFolder(systemId, deleteConfirm.value.id)
      if (selectedFolderId.value === deleteConfirm.value.id) {
        selectFolder(null)
      }
    } else {
      await api.templates.delete(systemId, deleteConfirm.value.id)
      if (selectedTemplateId.value === deleteConfirm.value.id) {
        selectedTemplateId.value = null
        selectedTemplate.value = null
      }
    }
    await templateStore.list(systemId)
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Failed to delete.'
  } finally {
    deleteConfirm.value.visible = false
  }
}

// ─── Context menu ─────────────────────────────────────────────────────────────

function showContextMenu(
  event: MouseEvent,
  type: 'folder' | 'template',
  id: string,
  name: string
): void {
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, type, id, name }
  document.addEventListener('click', hideContextMenu, { once: true })
}

function hideContextMenu(): void {
  contextMenu.value.visible = false
}

// ─── Drag and drop ────────────────────────────────────────────────────────────

function onDragStart(event: DragEvent, templateId: string): void {
  draggingTemplateId.value = templateId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', templateId)
  }
}

function onDragOver(event: DragEvent, folderId: string | null): void {
  event.preventDefault()
  isDraggingOver.value = true
  dragOverFolderId.value = folderId
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function onDragLeave(): void {
  isDraggingOver.value = false
  dragOverFolderId.value = null
}

async function onDrop(event: DragEvent, targetFolderId: string | null): Promise<void> {
  event.preventDefault()
  isDraggingOver.value = false
  dragOverFolderId.value = null

  const templateId = draggingTemplateId.value
  if (!templateId) return
  draggingTemplateId.value = null

  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const api = (window as any).app?.api
  if (!api) return

  try {
    await api.templates.move(systemId, templateId, targetFolderId)
    await templateStore.list(systemId)
    // If template is currently selected and was moved away from this view, deselect
    if (selectedTemplateId.value === templateId && selectedFolderId.value !== targetFolderId) {
      selectedTemplateId.value = null
      selectedTemplate.value = null
    }
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Failed to move template.'
  }
}

function onDragEnd(): void {
  draggingTemplateId.value = null
  isDraggingOver.value = false
  dragOverFolderId.value = null
}

function startResize(pane: 'tree' | 'list', event: MouseEvent): void {
  event.preventDefault()
  resizingPane.value = pane
  resizeStartX.value = event.clientX
  resizeStartTreeWidth.value = treeWidth.value
  resizeStartListWidth.value = listWidth.value
  window.addEventListener('mousemove', onResizeMove)
  window.addEventListener('mouseup', stopResize)
}

function onResizeMove(event: MouseEvent): void {
  const bodyWidth = bodyRef.value?.clientWidth
  if (!bodyWidth || !resizingPane.value) return

  const deltaX = event.clientX - resizeStartX.value

  if (resizingPane.value === 'tree') {
    // Keep room for list + detail while resizing the folder tree.
    const maxByLayout = bodyWidth - listWidth.value - DETAIL_MIN_WIDTH - 12
    const maxWidth = Math.max(TREE_MIN_WIDTH, Math.min(TREE_MAX_WIDTH, maxByLayout))
    treeWidth.value = Math.min(maxWidth, Math.max(TREE_MIN_WIDTH, resizeStartTreeWidth.value + deltaX))
    return
  }

  // Keep room for detail while resizing the template list.
  const maxByLayout = bodyWidth - treeWidth.value - DETAIL_MIN_WIDTH - 12
  const maxWidth = Math.max(LIST_MIN_WIDTH, Math.min(LIST_MAX_WIDTH, maxByLayout))
  listWidth.value = Math.min(maxWidth, Math.max(LIST_MIN_WIDTH, resizeStartListWidth.value + deltaX))
}

function stopResize(): void {
  resizingPane.value = null
  window.removeEventListener('mousemove', onResizeMove)
  window.removeEventListener('mouseup', stopResize)
}

onBeforeUnmount(() => {
  stopResize()
})
</script>

<template>
  <div class="tb">
    <!-- Toolbar -->
    <header class="tb__toolbar">
      <h2 class="tb__title" data-testid="tb-title">Templates</h2>
      <div class="tb__toolbar-actions">
        <button
          class="tb__btn tb__btn--secondary"
          data-testid="new-folder-btn"
          @click="openNewFolderDialog(selectedFolderId)"
        >
          <svg class="tb__icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 3.5H7L8.5 5H13.5V12.5H2.5V3.5Z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
          <span>New Folder</span>
        </button>
        <button
          class="tb__btn tb__btn--primary"
          data-testid="new-template-btn"
          @click="newTemplate"
        >
          + New Template
        </button>
      </div>
    </header>

    <div ref="bodyRef" class="tb__body">
      <!-- ── Left: Folder tree ─────────────────────────────────────────────── -->
      <aside
        class="tb__tree"
        :style="{ width: `${treeWidth}px` }"
        data-testid="folder-tree"
      >
        <!-- Root item -->
        <div
          class="tb__tree-item"
          :class="{
            'tb__tree-item--active': selectedFolderId === null,
            'tb__tree-item--dragover': isDraggingOver && dragOverFolderId === null
          }"
          data-testid="folder-root"
          @click="selectFolder(null)"
          @dragover="onDragOver($event, null)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, null)"
          @contextmenu.prevent="showContextMenu($event, 'folder', '', 'Root')"
        >
          <svg class="tb__icon tb__tree-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 3.5H7L8.5 5H13.5V12.5H2.5V3.5Z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
          <span>Root</span>
        </div>

        <!-- Folder tree items -->
        <div
          v-for="item in flatFolderTree"
          :key="item.id"
          class="tb__tree-item"
          :class="{
            'tb__tree-item--active': selectedFolderId === item.id,
            'tb__tree-item--dragover': isDraggingOver && dragOverFolderId === item.id
          }"
          :style="{ paddingLeft: `${12 + item.depth * 14}px` }"
          :data-testid="`folder-item-${item.id}`"
          @click="selectFolder(item.id)"
          @dragover.prevent="onDragOver($event, item.id)"
          @dragleave="onDragLeave"
          @drop="onDrop($event, item.id)"
          @contextmenu.prevent="showContextMenu($event, 'folder', item.id, item.name)"
        >
          <button
            v-if="item.hasChildren"
            class="tb__tree-toggle"
            :aria-label="expandedFolders.has(item.id) ? 'Collapse' : 'Expand'"
            @click.stop="toggleFolderExpand(item.id)"
          >
            {{ expandedFolders.has(item.id) ? '▾' : '▸' }}
          </button>
          <span v-else class="tb__tree-toggle tb__tree-toggle--spacer" />
          <svg class="tb__icon tb__tree-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 3.5H7L8.5 5H13.5V12.5H2.5V3.5Z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
          <span class="tb__tree-label">{{ item.name }}</span>
        </div>

        <!-- Empty state -->
        <div
          v-if="flatFolderTree.length === 0"
          class="tb__tree-empty"
          data-testid="folder-tree-empty"
        >
          No folders
        </div>
      </aside>

      <div
        class="tb__divider"
        :class="{ 'tb__divider--active': resizingPane === 'tree' }"
        data-testid="tree-list-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize folder tree"
        @mousedown="startResize('tree', $event)"
      />

      <!-- ── Middle: Template list ─────────────────────────────────────────── -->
      <section
        class="tb__list"
        :style="{ width: `${listWidth}px` }"
        data-testid="template-list"
      >
        <div class="tb__list-header">
          <span class="tb__list-title">
            {{
              selectedFolderId === null
                ? 'Root'
                : (templateStore.folders.find((f) => f.id === selectedFolderId)?.name ?? 'Folder')
            }}
          </span>
          <span class="tb__list-count">{{ templatesInSelectedFolder.length }} template(s)</span>
        </div>

        <div
          v-if="templatesInSelectedFolder.length === 0"
          class="tb__list-empty"
          data-testid="template-list-empty"
        >
          No templates in this folder
        </div>

        <div
          v-for="tmpl in templatesInSelectedFolder"
          :key="tmpl.id"
          class="tb__list-item"
          :class="{ 'tb__list-item--active': selectedTemplateId === tmpl.id }"
          :data-testid="`template-item-${tmpl.id}`"
          draggable="true"
          @click="selectTemplate(tmpl.id)"
          @dragstart="onDragStart($event, tmpl.id)"
          @dragend="onDragEnd"
          @contextmenu.prevent="showContextMenu($event, 'template', tmpl.id, tmpl.name)"
        >
          <span class="tb__list-item-icon">📄</span>
          <span class="tb__list-item-name">{{ tmpl.name }}</span>
        </div>
      </section>

      <div
        class="tb__divider"
        :class="{ 'tb__divider--active': resizingPane === 'list' }"
        data-testid="list-detail-divider"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize template list"
        @mousedown="startResize('list', $event)"
      />

      <!-- ── Right: Template detail ─────────────────────────────────────────── -->
      <section class="tb__detail" data-testid="template-detail">
        <div v-if="!selectedTemplate && !selectedTemplateId" class="tb__detail-empty">
          <p>Select a template to view details</p>
        </div>

        <div v-else-if="!selectedTemplate && selectedTemplateId" class="tb__detail-loading">
          Loading…
        </div>

        <div v-else-if="selectedTemplate" class="tb__detail-content">
          <!-- Header -->
          <div class="tb__detail-header">
            <h3 class="tb__detail-name" data-testid="detail-name">{{ selectedTemplate.name }}</h3>
            <div class="tb__detail-actions">
              <button
                class="tb__btn tb__btn--ghost"
                data-testid="preview-btn"
                :disabled="generating"
                @click="generatePreview"
              >
                <svg v-if="!generating" class="tb__icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M1.5 8C2.8 5.5 5.2 4 8 4C10.8 4 13.2 5.5 14.5 8C13.2 10.5 10.8 12 8 12C5.2 12 2.8 10.5 1.5 8Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                  />
                  <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.5" />
                </svg>
                <span>{{ generating ? 'Generating…' : 'Preview' }}</span>
              </button>
              <button
                class="tb__btn tb__btn--secondary"
                data-testid="edit-btn"
                @click="editTemplate(selectedTemplate.id, selectedTemplate.name)"
              >
                ✎ Edit
              </button>
              <button
                class="tb__btn tb__btn--primary"
                data-testid="send-btn"
                :disabled="sending"
                @click="quickSend"
              >
                <svg v-if="!sending" class="tb__icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M2 2.75L14 8L2 13.25L5.5 8L2 2.75Z"
                    fill="none"
                    stroke="currentColor"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                  />
                </svg>
                <span>{{ sending ? 'Sending…' : 'Send' }}</span>
              </button>
            </div>
          </div>

          <!-- Description -->
          <p
            v-if="selectedTemplate.description"
            class="tb__detail-desc"
            data-testid="detail-description"
          >
            {{ selectedTemplate.description }}
          </p>

          <!-- Metadata grid -->
          <dl class="tb__detail-meta">
            <dt class="tb__detail-label">Schema</dt>
            <dd class="tb__detail-value">
              <button
                class="tb__link"
                data-testid="schema-link"
                @click="openSchemaTab(selectedTemplate.schemaId)"
              >
                {{ getSchemaName(selectedTemplate.schemaId) }}
              </button>
            </dd>

            <dt class="tb__detail-label">Destination</dt>
            <dd class="tb__detail-value" data-testid="detail-destination">
              {{ getInputName(selectedTemplate.inputId) }}
            </dd>

            <dt class="tb__detail-label">Profiles</dt>
            <dd class="tb__detail-value">
              <span
                v-if="selectedTemplate.profileIds.length === 0"
                class="tb__detail-none"
                data-testid="profiles-empty"
              >
                None
              </span>
              <span
                v-for="(pid, idx) in selectedTemplate.profileIds"
                :key="pid"
                class="tb__profile-chip"
                :data-testid="`profile-chip-${idx}`"
              >
                {{ getProfileName(pid) }}
              </span>
            </dd>
          </dl>

          <!-- Preset fields -->
          <div class="tb__detail-section">
            <h4 class="tb__detail-section-title">Preset Fields</h4>
            <div
              v-if="!selectedTemplate.fields || selectedTemplate.fields.length === 0"
              class="tb__detail-none"
              data-testid="fields-empty"
            >
              No preset fields
            </div>
            <table
              v-else
              class="tb__fields-table"
              data-testid="fields-table"
            >
              <thead>
                <tr>
                  <th class="tb__th">Path</th>
                  <th class="tb__th">Value</th>
                  <th class="tb__th">Omitted</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(field, idx) in selectedTemplate.fields"
                  :key="idx"
                  :data-testid="`field-row-${idx}`"
                >
                  <td class="tb__td tb__td--path">{{ field.elementPath }}</td>
                  <td class="tb__td">
                    <span v-if="field.omitted" class="tb__detail-none">—</span>
                    <span v-else>{{ field.value ?? '' }}</span>
                  </td>
                  <td class="tb__td tb__td--center">
                    <span
                      v-if="field.omitted"
                      class="tb__omit-badge"
                      :data-testid="`field-omitted-${idx}`"
                    >
                      omit
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Error message -->
          <p
            v-if="errorMessage"
            class="tb__error"
            data-testid="error-message"
          >
            {{ errorMessage }}
          </p>

          <!-- Send result -->
          <div
            v-if="sendResult"
            class="tb__send-result"
            :class="sendResult.success ? 'tb__send-result--success' : 'tb__send-result--failure'"
            data-testid="send-result"
          >
            <span v-if="sendResult.success">✓ Event sent successfully</span>
            <span v-else>✗ {{ sendResult.error ?? 'Failed to send event.' }}</span>
          </div>

          <!-- Preview output -->
          <div v-if="previewJson !== null" class="tb__detail-section">
            <h4 class="tb__detail-section-title">Event Preview</h4>
            <pre class="tb__preview-json" data-testid="preview-json">{{ previewJson }}</pre>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Context menu ──────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="tb__context-menu"
        :style="{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }"
        data-testid="context-menu"
        @click.stop
      >
        <button
          v-if="contextMenu.type === 'folder' && contextMenu.id !== ''"
          class="tb__context-item"
          data-testid="ctx-new-subfolder"
          @click="openNewFolderDialog(contextMenu.id)"
        >
          <svg class="tb__icon" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.5 3.5H7L8.5 5H13.5V12.5H2.5V3.5Z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
            />
          </svg>
          <span>New Subfolder</span>
        </button>
        <button
          v-if="contextMenu.type === 'template'"
          class="tb__context-item"
          data-testid="ctx-edit"
          @click="editTemplate(contextMenu.id, contextMenu.name); hideContextMenu()"
        >
          ✎ Edit
        </button>
        <button
          v-if="contextMenu.id !== ''"
          class="tb__context-item tb__context-item--danger"
          data-testid="ctx-delete"
          @click="openDeleteConfirm(contextMenu.type as 'folder' | 'template', contextMenu.id, contextMenu.name)"
        >
          🗑 Delete
        </button>
      </div>
    </Teleport>

    <!-- ── New Folder dialog ─────────────────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="newFolderDialog.visible"
        class="tb__dialog-overlay"
        data-testid="new-folder-dialog"
        @click.self="newFolderDialog.visible = false"
      >
        <div class="tb__dialog">
          <h3 class="tb__dialog-title">New Folder</h3>
          <input
            v-model="newFolderDialog.name"
            class="tb__dialog-input"
            placeholder="Folder name"
            data-testid="new-folder-name-input"
            @keydown.enter="createFolder"
            @keydown.esc="newFolderDialog.visible = false"
          />
          <div class="tb__dialog-actions">
            <button
              class="tb__btn tb__btn--secondary"
              @click="newFolderDialog.visible = false"
            >
              Cancel
            </button>
            <button
              class="tb__btn tb__btn--primary"
              :disabled="!newFolderDialog.name.trim()"
              data-testid="new-folder-confirm-btn"
              @click="createFolder"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Delete confirmation dialog ───────────────────────────────────────── -->
    <Teleport to="body">
      <div
        v-if="deleteConfirm.visible"
        class="tb__dialog-overlay"
        data-testid="delete-confirm-dialog"
        @click.self="deleteConfirm.visible = false"
      >
        <div class="tb__dialog">
          <h3 class="tb__dialog-title">Confirm Delete</h3>
          <p class="tb__dialog-body">
            Delete {{ deleteConfirm.type }}
            <strong>{{ deleteConfirm.name }}</strong>?
            <span v-if="deleteConfirm.type === 'folder'">
              All templates inside will also be deleted.
            </span>
          </p>
          <div class="tb__dialog-actions">
            <button
              class="tb__btn tb__btn--secondary"
              @click="deleteConfirm.visible = false"
            >
              Cancel
            </button>
            <button
              class="tb__btn tb__btn--danger"
              data-testid="delete-confirm-btn"
              @click="confirmDelete"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tb {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #cdd6f4;
  font-size: 13px;
  overflow: hidden;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */

.tb__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 16px 0;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.tb__title {
  font-size: 20px;
  font-weight: 700;
  color: #cdd6f4;
  margin: 0;
}

.tb__toolbar-actions {
  display: flex;
  gap: 8px;
}

/* ── Body layout ─────────────────────────────────────────────────────────── */

.tb__body {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  margin-top: 16px;
}

/* ── Tree panel ──────────────────────────────────────────────────────────── */

.tb__tree {
  flex-shrink: 0;
  overflow-y: auto;
  border-right: 1px solid #313244;
  padding-right: 0;
}

.tb__tree-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  cursor: pointer;
  border-radius: 4px;
  margin: 1px 4px;
  user-select: none;
}

.tb__tree-item:hover {
  background: #313244;
}

.tb__tree-item--active {
  background: #313244;
  color: #89b4fa;
}

.tb__tree-item--dragover {
  background: #2a3a5a;
  outline: 2px dashed #89b4fa;
}

.tb__tree-toggle {
  background: none;
  border: none;
  color: #585b70;
  font-size: 9px;
  cursor: pointer;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
}

.tb__tree-toggle--spacer {
  cursor: default;
}

.tb__tree-icon {
  width: 13px;
  height: 13px;
}

.tb__tree-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.tb__tree-empty {
  padding: 12px 8px;
  color: #45475a;
  font-style: italic;
  font-size: 12px;
}

/* ── Template list panel ─────────────────────────────────────────────────── */

.tb__list {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #313244;
  overflow-y: auto;
}

.tb__divider {
  width: 6px;
  flex-shrink: 0;
  cursor: col-resize;
  position: relative;
  background: transparent;
}

.tb__divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 2px;
  width: 1px;
  background: #313244;
}

.tb__divider:hover::before,
.tb__divider--active::before {
  background: #89b4fa;
}

.tb__list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.tb__list-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #585b70;
}

.tb__list-count {
  font-size: 11px;
  color: #45475a;
}

.tb__list-empty {
  padding: 12px;
  color: #45475a;
  font-style: italic;
  font-size: 12px;
}

.tb__list-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  cursor: pointer;
  user-select: none;
}

.tb__list-item:hover {
  background: #313244;
}

.tb__list-item--active {
  background: #313244;
  color: #89b4fa;
}

.tb__list-item-icon {
  font-size: 11px;
  flex-shrink: 0;
}

.tb__list-item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

/* ── Detail panel ────────────────────────────────────────────────────────── */

.tb__detail {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px;
}

.tb__detail-empty,
.tb__detail-loading {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #585b70;
  font-size: 14px;
}

.tb__detail-content {
  padding: 4px 0 24px;
}

.tb__detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.tb__detail-name {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: #cdd6f4;
}

.tb__detail-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.tb__detail-desc {
  color: #a6adc8;
  font-size: 13px;
  margin: 0 0 16px;
}

.tb__detail-meta {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 6px 12px;
  margin: 0 0 20px;
}

.tb__detail-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #585b70;
  align-self: start;
  padding-top: 2px;
}

.tb__detail-value {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: flex-start;
  margin: 0;
}

.tb__detail-none {
  color: #45475a;
  font-style: italic;
}

.tb__link {
  background: none;
  border: none;
  color: #89b4fa;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.tb__link:hover {
  color: #b4befe;
}

.tb__profile-chip {
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 11px;
  color: #cdd6f4;
}

.tb__detail-section {
  margin-top: 20px;
}

.tb__detail-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #585b70;
  margin: 0 0 8px;
}

/* ── Fields table ────────────────────────────────────────────────────────── */

.tb__fields-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.tb__th {
  text-align: left;
  padding: 6px 8px;
  background: #181825;
  color: #585b70;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #313244;
}

.tb__td {
  padding: 5px 8px;
  border-bottom: 1px solid #1e1e2e;
  color: #cdd6f4;
  vertical-align: middle;
}

.tb__td--path {
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  color: #89b4fa;
}

.tb__td--center {
  text-align: center;
}

.tb__omit-badge {
  background: #45475a;
  color: #a6adc8;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Error / send result ─────────────────────────────────────────────────── */

.tb__error {
  color: #f38ba8;
  font-size: 13px;
  margin: 12px 0 0;
  padding: 8px 12px;
  background: #2a1520;
  border: 1px solid #f38ba844;
  border-radius: 4px;
}

.tb__send-result {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  border: 1px solid;
}

.tb__send-result--success {
  background: #1a2a1a;
  border-color: #a6e3a144;
  color: #a6e3a1;
}

.tb__send-result--failure {
  background: #2a1520;
  border-color: #f38ba844;
  color: #f38ba8;
}

/* ── Preview JSON ─────────────────────────────────────────────────────────── */

.tb__preview-json {
  background: #181825;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 12px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #cdd6f4;
  overflow: auto;
  max-height: 300px;
  white-space: pre;
  margin: 0;
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

.tb__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s ease;
  white-space: nowrap;
}

.tb__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tb__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.tb__btn--primary:hover:not(:disabled) {
  background: #b4befe;
  border-color: #b4befe;
}

.tb__btn--secondary {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.tb__btn--secondary:hover:not(:disabled) {
  background: #45475a;
}

.tb__btn--ghost {
  background: transparent;
  color: #a6adc8;
  border-color: transparent;
}

.tb__btn--ghost:hover:not(:disabled) {
  background: #313244;
  color: #cdd6f4;
}

.tb__btn--danger {
  background: #f38ba8;
  color: #1e1e2e;
  border-color: #f38ba8;
}

.tb__btn--danger:hover:not(:disabled) {
  background: #eb6f92;
  border-color: #eb6f92;
}

.tb__icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
</style>

<style>
/* ── Context menu (global, teleported) ───────────────────────────────────── */

.tb__context-menu {
  position: fixed;
  z-index: 9999;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.tb__context-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  color: #cdd6f4;
  font-size: 13px;
  padding: 6px 14px;
  text-align: left;
  cursor: pointer;
}

.tb__context-item:hover {
  background: #45475a;
}

.tb__context-item--danger {
  color: #f38ba8;
}

/* ── Dialog overlay (global, teleported) ─────────────────────────────────── */

.tb__dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tb__dialog {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 8px;
  padding: 24px;
  min-width: 320px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.tb__dialog-title {
  font-size: 16px;
  font-weight: 700;
  color: #cdd6f4;
  margin: 0 0 16px;
}

.tb__dialog-body {
  font-size: 13px;
  color: #a6adc8;
  margin: 0 0 16px;
  line-height: 1.5;
}

.tb__dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 4px;
  color: #cdd6f4;
  font-size: 13px;
  outline: none;
  margin-bottom: 16px;
}

.tb__dialog-input:focus {
  border-color: #89b4fa;
}

.tb__dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
