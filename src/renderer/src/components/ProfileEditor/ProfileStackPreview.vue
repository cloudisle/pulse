<script setup lang="ts">
import {ref, computed, watch, onMounted, toRaw} from 'vue'
import { useProfileStore } from '@renderer/stores/profile'
import { useSchemaStore } from '@renderer/stores/schema.store'
import { useSystemStore } from '@renderer/stores/system'
import { useUiStore } from '@renderer/stores/ui'
import type { Profile, ProfileOverride } from '@shared/models/profile'
import type { Schema, SchemaElement } from '@shared/models/schema'

// ─── Types ─────────────────────────────────────────────────────────────────

interface StackEntry {
  elementPath: string
  winnerProfileId: string
  winnerAction: string
  winnerValue: any
  allProfiles: { profileId: string; action: string; value: any }[]
  isConflict: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROFILE_COLORS = [
  '#89b4fa',
  '#a6e3a1',
  '#f38ba8',
  '#fab387',
  '#f9e2af',
  '#cba6f7',
  '#94e2d5',
  '#89dceb'
]

// ─── Stores ─────────────────────────────────────────────────────────────────

const profileStore = useProfileStore()
const schemaStore = useSchemaStore()
const systemStore = useSystemStore()
const uiStore = useUiStore()

// ─── State ──────────────────────────────────────────────────────────────────

const fullProfiles = ref<Profile[]>([])
const selectedSchemaId = ref<string | null>(null)
const schemaElements = ref<SchemaElement[]>([])
const samplePayload = ref<string | null>(null)
const generating = ref(false)
const errorMessage = ref('')
const loading = ref(false)

// ─── Computed ────────────────────────────────────────────────────────────────

const orderedProfiles = computed(() =>
  profileStore.activeProfileIds
    .map((id) => fullProfiles.value.find((p) => p.id === id))
    .filter((p): p is Profile => !!p)
)

function profileColor(profileId: string): string {
  const idx = profileStore.activeProfileIds.indexOf(profileId)
  return PROFILE_COLORS[idx % PROFILE_COLORS.length]
}

const stackEntries = computed<StackEntry[]>(() => {
  const pathMap = new Map<string, { profileId: string; action: string; value: any }[]>()

  for (const profile of orderedProfiles.value) {
    for (const override of profile.overrides ?? []) {
      if (!override.elementPath) continue
      const existing = pathMap.get(override.elementPath) ?? []
      existing.push({
        profileId: profile.id,
        action: override.action,
        value: override.action === 'set' ? override.value : override.action
      })
      pathMap.set(override.elementPath, existing)
    }
  }

  const entries: StackEntry[] = []
  for (const [elementPath, contributions] of pathMap.entries()) {
    const winner = contributions[contributions.length - 1]
    entries.push({
      elementPath,
      winnerProfileId: winner.profileId,
      winnerAction: winner.action,
      winnerValue: winner.value,
      allProfiles: contributions,
      isConflict: contributions.length > 1
    })
  }

  entries.sort((a, b) => a.elementPath.localeCompare(b.elementPath))
  return entries
})

const conflicts = computed(() => stackEntries.value.filter((e) => e.isConflict))

// ─── Load profiles ──────────────────────────────────────────────────────────

async function loadFullProfiles(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  const api = (window as any).app?.api
  if (!api || !systemId) return
  loading.value = true
  try {
    const results = await Promise.all(
      profileStore.activeProfileIds.map((id) => api.profiles.get(systemId, id))
    )
    fullProfiles.value = results.filter(Boolean) as Profile[]
  } catch {
    errorMessage.value = 'Failed to load profile details.'
  } finally {
    loading.value = false
  }
}

// ─── Load schema ─────────────────────────────────────────────────────────────

function flattenElements(elements: SchemaElement[], prefix = ''): SchemaElement[] {
  const flat: SchemaElement[] = []
  for (const el of elements) {
    const path = prefix ? `${prefix}.${el.name}` : el.name
    flat.push({ ...el, name: path })
    if (el.children?.length) {
      flat.push(...flattenElements(el.children, path))
    }
  }
  return flat
}

async function loadSchema(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  const api = (window as any).app?.api
  if (!api || !systemId || !selectedSchemaId.value) {
    schemaElements.value = []
    return
  }
  try {
    const schema: Schema = await api.schemas.get(systemId, selectedSchemaId.value)
    schemaElements.value = flattenElements(schema.elements ?? [])
  } catch {
    schemaElements.value = []
  }
}

watch(selectedSchemaId, loadSchema)
watch(() => profileStore.activeProfileIds, loadFullProfiles, { deep: true })

// ─── Reorder ─────────────────────────────────────────────────────────────────

function moveUp(id: string): void {
  profileStore.moveProfileUp(id)
}

function moveDown(id: string): void {
  profileStore.moveProfileDown(id)
}

// ─── Generate sample ─────────────────────────────────────────────────────────

async function generateSample(): Promise<void> {
  if (!selectedSchemaId.value) {
    errorMessage.value = 'Select a schema to generate a sample.'
    return
  }
  const systemId = systemStore.selectedSystemId
  const api = (window as any).app?.api
  if (!api || !systemId) return
  generating.value = true
  errorMessage.value = ''
  samplePayload.value = null
  try {
    const event = await api.events.generate(systemId, {
      schemaId: selectedSchemaId.value,
      profileIds: toRaw(profileStore.activeProfileIds),
      overrides: {}
    })
    samplePayload.value = JSON.stringify(event.payload, null, 2)
  } catch (err: any) {
    errorMessage.value = err?.message ?? 'Failed to generate sample.'
  } finally {
    generating.value = false
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function profileName(profileId: string): string {
  return orderedProfiles.value.find((p) => p.id === profileId)?.name ?? profileId
}

function overrideCount(profile: Profile): number {
  return (profile.overrides ?? []).length
}

function entryForPath(elementPath: string): StackEntry | undefined {
  return stackEntries.value.find((e) => e.elementPath === elementPath)
}

function actionLabel(action: string, value: any): string {
  if (action === 'set') return `set → ${JSON.stringify(value)}`
  return action
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(async () => {
  await schemaStore.list(systemStore.selectedSystemId ?? '')
  await loadFullProfiles()
})
</script>

<template>
  <div class="stack-preview__backdrop" data-testid="stack-preview-backdrop" tabindex="-1" @click.self="uiStore.closeStackPreview()" @keydown.esc="uiStore.closeStackPreview()">
    <div class="stack-preview__modal" data-testid="stack-preview-modal">
      <!-- Header -->
      <div class="stack-preview__header">
        <h2 class="stack-preview__title">Profile Stack Preview</h2>
        <button
          class="stack-preview__close"
          data-testid="stack-preview-close"
          aria-label="Close"
          @click="uiStore.closeStackPreview()"
        >✕</button>
      </div>

      <div class="stack-preview__body">
        <!-- Left: Profile list + schema selector -->
        <div class="stack-preview__sidebar">
          <h3 class="stack-preview__section-title">Active Profiles</h3>
          <div v-if="loading" class="stack-preview__loading">Loading…</div>
          <ul class="stack-preview__profile-list" data-testid="profile-stack-list">
            <li
              v-for="(profile, idx) in orderedProfiles"
              :key="profile.id"
              class="stack-preview__profile-item"
              data-testid="profile-stack-item"
            >
              <span
                class="stack-preview__profile-color"
                :style="{ background: profileColor(profile.id) }"
              />
              <span class="stack-preview__profile-name">{{ profile.name }}</span>
              <span class="stack-preview__profile-count">{{ overrideCount(profile) }} overrides</span>
              <div class="stack-preview__profile-controls">
                <button
                  class="stack-preview__order-btn"
                  data-testid="move-up-btn"
                  :disabled="idx === 0"
                  aria-label="Move up"
                  @click="moveUp(profile.id)"
                >▲</button>
                <button
                  class="stack-preview__order-btn"
                  data-testid="move-down-btn"
                  :disabled="idx === orderedProfiles.length - 1"
                  aria-label="Move down"
                  @click="moveDown(profile.id)"
                >▼</button>
              </div>
            </li>
          </ul>

          <div class="stack-preview__schema-selector">
            <label class="stack-preview__label" for="stack-schema-select">Schema</label>
            <select
              id="stack-schema-select"
              class="stack-preview__select"
              data-testid="schema-select"
              :value="selectedSchemaId ?? ''"
              @change="selectedSchemaId = ($event.target as HTMLSelectElement).value || null"
            >
              <option value="">— Select schema —</option>
              <option v-for="schema in schemaStore.schemas" :key="schema.id" :value="schema.id">
                {{ schema.name }}
              </option>
            </select>
          </div>

          <button
            class="stack-preview__btn stack-preview__btn--primary"
            data-testid="generate-sample-btn"
            :disabled="generating || !selectedSchemaId"
            @click="generateSample()"
          >
            {{ generating ? 'Generating…' : 'Generate Sample' }}
          </button>

          <div v-if="errorMessage" class="stack-preview__error" data-testid="error-message">
            {{ errorMessage }}
          </div>
        </div>

        <!-- Right: Combined impact + sample -->
        <div class="stack-preview__main">
          <!-- Conflict warnings -->
          <div v-if="conflicts.length" class="stack-preview__conflicts" data-testid="conflict-warnings">
            <h3 class="stack-preview__section-title stack-preview__section-title--warn">
              ⚠ Conflicts ({{ conflicts.length }})
            </h3>
            <ul class="stack-preview__conflict-list">
              <li
                v-for="conflict in conflicts"
                :key="conflict.elementPath"
                class="stack-preview__conflict-item"
                data-testid="conflict-item"
              >
                <span class="stack-preview__conflict-path">{{ conflict.elementPath }}</span>:
                <span
                  v-for="(contrib, ci) in conflict.allProfiles"
                  :key="ci"
                >
                  <span
                    class="stack-preview__conflict-profile"
                    :style="{ color: profileColor(contrib.profileId) }"
                    :class="{ 'stack-preview__conflict-profile--overwritten': ci < conflict.allProfiles.length - 1 }"
                  >{{ profileName(contrib.profileId) }}</span>
                  <span v-if="ci < conflict.allProfiles.length - 1"> → </span>
                </span>
                <span class="stack-preview__conflict-winner">
                  (winner: <strong :style="{ color: profileColor(conflict.winnerProfileId) }">{{ profileName(conflict.winnerProfileId) }}</strong>)
                </span>
              </li>
            </ul>
          </div>

          <!-- Combined impact tree -->
          <div class="stack-preview__impact">
            <h3 class="stack-preview__section-title">Combined Impact</h3>
            <div v-if="stackEntries.length === 0" class="stack-preview__empty">
              No overrides in active profiles.
            </div>
            <table v-else class="stack-preview__impact-table" data-testid="impact-table">
              <thead>
                <tr>
                  <th class="stack-preview__th">Field</th>
                  <th class="stack-preview__th">Profile</th>
                  <th class="stack-preview__th">Override</th>
                  <th class="stack-preview__th">Overwritten by</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="entry in stackEntries"
                  :key="entry.elementPath"
                  class="stack-preview__impact-row"
                  :class="{ 'stack-preview__impact-row--conflict': entry.isConflict }"
                  data-testid="impact-row"
                >
                  <td class="stack-preview__td stack-preview__td--path">{{ entry.elementPath }}</td>
                  <td class="stack-preview__td">
                    <span
                      class="stack-preview__profile-badge"
                      :style="{ background: profileColor(entry.winnerProfileId) + '22', color: profileColor(entry.winnerProfileId), borderColor: profileColor(entry.winnerProfileId) }"
                    >{{ profileName(entry.winnerProfileId) }}</span>
                  </td>
                  <td class="stack-preview__td">{{ actionLabel(entry.winnerAction, entry.winnerValue) }}</td>
                  <td class="stack-preview__td">
                    <template v-if="entry.isConflict">
                      <span
                        v-for="(contrib, ci) in entry.allProfiles.slice(0, -1)"
                        :key="ci"
                        class="stack-preview__overwritten"
                        :style="{ color: profileColor(contrib.profileId) }"
                        :title="`${profileName(contrib.profileId)}: ${actionLabel(contrib.action, contrib.value)}`"
                      >{{ profileName(contrib.profileId) }}</span>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Sample output -->
          <div v-if="samplePayload" class="stack-preview__sample" data-testid="sample-output">
            <h3 class="stack-preview__section-title">Generated Sample</h3>
            <pre class="stack-preview__json">{{ samplePayload }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stack-preview__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.stack-preview__modal {
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 10px;
  width: 90vw;
  max-width: 1100px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

.stack-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.stack-preview__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #cdd6f4;
}

.stack-preview__close {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}

.stack-preview__close:hover {
  background: #313244;
  color: #cdd6f4;
}

.stack-preview__body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.stack-preview__sidebar {
  width: 260px;
  flex-shrink: 0;
  border-right: 1px solid #313244;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.stack-preview__main {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stack-preview__section-title {
  font-size: 12px;
  font-weight: 600;
  color: #a6adc8;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0 0 8px 0;
}

.stack-preview__section-title--warn {
  color: #f9e2af;
}

.stack-preview__loading {
  font-size: 13px;
  color: #585b70;
  font-style: italic;
}

.stack-preview__profile-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stack-preview__profile-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 6px;
}

.stack-preview__profile-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.stack-preview__profile-name {
  font-size: 13px;
  color: #cdd6f4;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stack-preview__profile-count {
  font-size: 11px;
  color: #585b70;
  white-space: nowrap;
}

.stack-preview__profile-controls {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stack-preview__order-btn {
  background: none;
  border: none;
  color: #a6adc8;
  font-size: 10px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
}

.stack-preview__order-btn:hover:not(:disabled) {
  color: #89b4fa;
}

.stack-preview__order-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stack-preview__schema-selector {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stack-preview__label {
  font-size: 12px;
  color: #a6adc8;
}

.stack-preview__select {
  background: #181825;
  border: 1px solid #313244;
  color: #cdd6f4;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 4px;
  outline: none;
  width: 100%;
}

.stack-preview__select:focus {
  border-color: #89b4fa;
}

.stack-preview__btn {
  padding: 7px 14px;
  border-radius: 5px;
  border: none;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}

.stack-preview__btn--primary {
  background: #89b4fa;
  color: #1e1e2e;
}

.stack-preview__btn--primary:hover:not(:disabled) {
  background: #b4befe;
}

.stack-preview__btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stack-preview__error {
  font-size: 12px;
  color: #f38ba8;
  padding: 6px 8px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(243, 139, 168, 0.3);
}

/* Conflicts */
.stack-preview__conflicts {
  padding: 12px;
  background: rgba(249, 226, 175, 0.06);
  border: 1px solid rgba(249, 226, 175, 0.2);
  border-radius: 6px;
}

.stack-preview__conflict-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stack-preview__conflict-item {
  font-size: 13px;
  color: #cdd6f4;
}

.stack-preview__conflict-path {
  font-family: monospace;
  color: #f9e2af;
  font-weight: 600;
}

.stack-preview__conflict-profile {
  font-weight: 500;
}

.stack-preview__conflict-profile--overwritten {
  text-decoration: line-through;
  opacity: 0.7;
}

.stack-preview__conflict-winner {
  font-size: 12px;
  color: #a6adc8;
  margin-left: 4px;
}

/* Impact table */
.stack-preview__impact-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.stack-preview__th {
  text-align: left;
  padding: 6px 10px;
  background: #181825;
  color: #a6adc8;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid #313244;
}

.stack-preview__impact-row {
  border-bottom: 1px solid #27273a;
}

.stack-preview__impact-row--conflict {
  background: rgba(249, 226, 175, 0.04);
}

.stack-preview__td {
  padding: 6px 10px;
  color: #cdd6f4;
  vertical-align: middle;
}

.stack-preview__td--path {
  font-family: monospace;
  font-size: 12px;
  color: #89b4fa;
}

.stack-preview__profile-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  border: 1px solid;
}

.stack-preview__overwritten {
  text-decoration: line-through;
  font-size: 12px;
  margin-right: 4px;
  opacity: 0.7;
}

.stack-preview__empty {
  font-size: 13px;
  color: #585b70;
  font-style: italic;
  padding: 12px 0;
}

/* Sample JSON */
.stack-preview__sample {
  flex-shrink: 0;
}

.stack-preview__json {
  background: #181825;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  color: #a6e3a1;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}
</style>
