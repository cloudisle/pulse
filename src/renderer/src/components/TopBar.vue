<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useEnvironmentStore } from '@renderer/stores/environment'
import { useProfileStore } from '@renderer/stores/profile'
import { useSessionStore } from '@renderer/stores/session.store'
import { useSystemStore } from '@renderer/stores/system'
import { useUiStore } from '@renderer/stores/ui'

const environmentStore = useEnvironmentStore()
const profileStore = useProfileStore()
const sessionStore = useSessionStore()
const systemStore = useSystemStore()
const uiStore = useUiStore()

const selectedSession = computed(
  () => sessionStore.sessions.find((session) => session.id === sessionStore.selectedSessionId) ?? null
)
const renamingSession = ref(false)
const sessionNameDraft = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

function openProfileEditor(): void {
  uiStore.openTab({ id: 'profile:new', type: 'profile', title: 'New Profile' })
}

function selectSession(sessionId: string): void {
  sessionStore.selectSession(sessionId || null)
  uiStore.selectSession(sessionId || null)
}

async function createSession(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const created = await sessionStore.createSession(systemId)
  if (!created) return
  uiStore.selectSession(created.id)
}

function startRenameSelectedSession(): void {
  const session = selectedSession.value
  if (!session) return
  sessionNameDraft.value = session.name ?? session.id
  renamingSession.value = true
  nextTick(() => {
    renameInputRef.value?.focus()
    renameInputRef.value?.select()
  })
}

function cancelRenameSelectedSession(): void {
  renamingSession.value = false
  sessionNameDraft.value = ''
}

async function confirmRenameSelectedSession(): Promise<void> {
  const systemId = systemStore.selectedSystemId
  const session = selectedSession.value
  if (!systemId || !session) return

  const trimmed = sessionNameDraft.value.trim()
  if (!trimmed) return

  const renamed = await sessionStore.renameSession(systemId, session.id, trimmed)
  if (!renamed) return
  uiStore.renameTab(`session:${session.id}`, renamed.name ?? session.id)
  cancelRenameSelectedSession()
}
</script>

<template>
  <header class="top-bar">
    <div class="top-bar__logo">
      <span class="top-bar__title">Pulse</span>
    </div>
    <div class="top-bar__spacer" />
    <div class="top-bar__right">
      <div class="top-bar__group">
        <label class="top-bar__label" for="session-select">Session</label>
        <select
          id="session-select"
          class="top-bar__select"
          :value="sessionStore.selectedSessionId ?? ''"
          @change="selectSession(($event.target as HTMLSelectElement).value)"
        >
          <option value="">(none)</option>
          <option
            v-for="session in sessionStore.sessions"
            :key="session.id"
            :value="session.id"
          >{{ session.name ?? session.id }}</option>
        </select>
        <button
          class="top-bar__icon-btn"
          data-testid="create-session-btn"
          :disabled="!systemStore.selectedSystemId"
          title="Create session"
          @click="createSession"
        >+</button>
        <button
          class="top-bar__flat-btn"
          data-testid="rename-session-btn"
          :disabled="!selectedSession || !systemStore.selectedSystemId"
          title="Rename selected session"
          @click="startRenameSelectedSession"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

      <!-- Rename modal -->
      <Teleport to="body">
        <div
          v-if="renamingSession"
          class="rename-modal-overlay"
          data-testid="rename-session-modal"
          @click.self="cancelRenameSelectedSession"
          @keydown.esc="cancelRenameSelectedSession"
        >
          <div class="rename-modal" role="dialog" aria-modal="true" aria-label="Rename session">
            <h3 class="rename-modal__title">Rename Session</h3>
            <input
              ref="renameInputRef"
              v-model="sessionNameDraft"
              class="rename-modal__input"
              data-testid="topbar-session-rename-input"
              type="text"
              placeholder="Session name"
              @keydown.enter="confirmRenameSelectedSession"
              @keydown.esc="cancelRenameSelectedSession"
            />
            <div class="rename-modal__actions">
              <button
                class="rename-modal__btn rename-modal__btn--cancel"
                data-testid="topbar-session-rename-cancel"
                @click="cancelRenameSelectedSession"
              >Cancel</button>
              <button
                class="rename-modal__btn rename-modal__btn--save"
                data-testid="topbar-session-rename-save"
                :disabled="!sessionNameDraft.trim()"
                @click="confirmRenameSelectedSession"
              >Save</button>
            </div>
          </div>
        </div>
      </Teleport>
      </div>
      <div class="top-bar__group">
        <label class="top-bar__label" for="environment-select">Environment</label>
        <select
          id="environment-select"
          class="top-bar__select"
          :value="environmentStore.selectedEnvironmentId ?? ''"
          @change="environmentStore.selectEnvironment(($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">(none)</option>
          <option
            v-for="env in environmentStore.environments"
            :key="env.id"
            :value="env.id"
          >{{ env.name }}</option>
        </select>
      </div>
      <div class="top-bar__group">
        <label class="top-bar__label">Profiles</label>
        <div class="top-bar__profile-list">
          <span
            v-for="profile in profileStore.availableProfiles"
            :key="profile.id"
            class="top-bar__profile-chip"
            :class="{ 'top-bar__profile-chip--active': profileStore.activeProfileIds.includes(profile.id) }"
            role="button"
            tabindex="0"
            @click="profileStore.toggleProfile(profile.id)"
            @keydown.enter="profileStore.toggleProfile(profile.id)"
          >
            <span
              v-if="profileStore.activeProfileIds.includes(profile.id)"
              class="top-bar__profile-order"
            >{{ profileStore.activeProfileIds.indexOf(profile.id) + 1 }}</span>
            {{ profile.name }}
          </span>
          <span v-if="profileStore.availableProfiles.length === 0" class="top-bar__profile-empty">
            No profiles —
            <a
              href="#"
              class="top-bar__profile-create-link"
              @click.prevent="openProfileEditor"
            >create one</a>
          </span>
        </div>
        <button
          v-if="profileStore.activeProfileIds.length >= 2"
          class="top-bar__preview-btn"
          data-testid="preview-stack-btn"
          @click="uiStore.openStackPreview()"
        >Preview stack</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  background: #1e1e2e;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.top-bar__logo {
  flex: 0 0 auto;
}

.top-bar__title {
  font-size: 18px;
  font-weight: 700;
  color: #cdd6f4;
  letter-spacing: 0.04em;
}

.top-bar__spacer {
  flex: 1 1 auto;
}

.top-bar__right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
}

.top-bar__group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-bar__label {
  font-size: 12px;
  color: #a6adc8;
  white-space: nowrap;
}

.top-bar__select {
  padding: 4px 8px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
}

.top-bar__icon-btn {
  padding: 2px 8px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
}

.top-bar__icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.top-bar__flat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  background: transparent;
  color: #a6adc8;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.top-bar__flat-btn:hover:not(:disabled) {
  color: #cdd6f4;
  background: rgba(255, 255, 255, 0.08);
}

.top-bar__flat-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* Rename modal */
.rename-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.rename-modal {
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 8px;
  padding: 24px;
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.rename-modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #cdd6f4;
}

.rename-modal__input {
  width: 100%;
  padding: 8px 10px;
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #89b4fa;
  border-radius: 4px;
  font-size: 13px;
  box-sizing: border-box;
  outline: none;
}

.rename-modal__input:focus {
  border-color: #89b4fa;
  box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.25);
}

.rename-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.rename-modal__btn {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.15s;
}

.rename-modal__btn--cancel {
  background: #313244;
  color: #cdd6f4;
  border-color: #45475a;
}

.rename-modal__btn--cancel:hover {
  background: #45475a;
}

.rename-modal__btn--save {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
  font-weight: 600;
}

.rename-modal__btn--save:hover:not(:disabled) {
  background: #74c7ec;
  border-color: #74c7ec;
}

.rename-modal__btn--save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.top-bar__profile-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.top-bar__profile-chip {
  padding: 2px 10px;
  border-radius: 12px;
  background: #313244;
  color: #cdd6f4;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid #45475a;
  user-select: none;
}

.top-bar__profile-chip--active {
  background: #89b4fa;
  color: #1e1e2e;
  border-color: #89b4fa;
}

.top-bar__profile-empty {
  font-size: 12px;
  color: #585b70;
  font-style: italic;
}

.top-bar__preview-btn {
  padding: 3px 10px;
  background: #313244;
  color: #89b4fa;
  border: 1px solid #89b4fa;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}

.top-bar__preview-btn:hover {
  background: rgba(137, 180, 250, 0.15);
}

.top-bar__profile-create-link {
  color: #89b4fa;
  text-decoration: underline;
  cursor: pointer;
}

.top-bar__profile-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #1e1e2e;
  color: #89b4fa;
  font-size: 9px;
  font-weight: 700;
  margin-right: 3px;
  flex-shrink: 0;
}
</style>
