<script setup lang="ts">
import { onMounted } from 'vue'
import { useSystemStore } from '@renderer/stores/system'
import { useSessionStore } from '@renderer/stores/session.store'
import { useUiStore } from '@renderer/stores/ui'

const systemStore = useSystemStore()
const sessionStore = useSessionStore()
const uiStore = useUiStore()

onMounted(async () => {
  if (systemStore.selectedSystemId) {
    await sessionStore.loadSessions(systemStore.selectedSystemId)
  }
})

function openSession(sessionId: string, sessionName: string): void {
  uiStore.openTab({
    id: `session:${sessionId}`,
    type: 'session',
    title: sessionName
  })
}

async function deleteSession(sessionId: string): Promise<void> {
  const systemId = systemStore.selectedSystemId
  if (!systemId) return
  const confirmed = window.confirm('Delete this session? This cannot be undone.')
  if (!confirmed) return
  await sessionStore.deleteSession(systemId, sessionId)
  uiStore.closeTab(`session:${sessionId}`)
  if (uiStore.selectedSessionId === sessionId) {
    uiStore.selectSession(null)
  }
}
</script>

<template>
  <div class="sessions-view">
    <div class="sessions-view__header">
      <h2 class="sessions-view__title">Sessions</h2>
      <p v-if="!systemStore.selectedSystemId" class="sessions-view__hint">
        Please select a system from the sidebar to view sessions.
      </p>
    </div>

    <div v-if="systemStore.selectedSystemId" class="sessions-view__content">
      <div v-if="sessionStore.sessions.length === 0" class="sessions-view__empty">
        <p>No sessions yet.</p>
        <p class="sessions-view__empty-hint">Create a new session from the top bar.</p>
      </div>

      <div v-else class="sessions-view__table-wrap">
        <table class="sessions-view__table" data-testid="sessions-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Session ID</th>
              <th>Created</th>
              <th>Updated</th>
              <th class="sessions-view__actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="session in sessionStore.sessions"
              :key="session.id"
              class="sessions-view__row"
              :class="{ 'sessions-view__row--selected': sessionStore.selectedSessionId === session.id }"
            >
              <td class="sessions-view__name">
                <span>{{ session.name ?? 'Unnamed Session' }}</span>
              </td>
              <td class="sessions-view__id">{{ session.id }}</td>
              <td>{{ new Date(session.createdAt).toLocaleString() }}</td>
              <td>{{ new Date(session.updatedAt).toLocaleString() }}</td>
              <td class="sessions-view__actions-col">
                <div class="sessions-view__actions">
                  <button
                    class="sessions-view__view-btn"
                    @click.stop="openSession(session.id, session.name ?? session.id)"
                  >
                    View
                  </button>
                  <button
                    class="sessions-view__icon-btn sessions-view__icon-btn--danger"
                    :data-testid="`delete-session-${session.id}`"
                    title="Delete session"
                    @click.stop="deleteSession(session.id)"
                  >Del</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sessions-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e2e;
  color: #cdd6f4;
}

.sessions-view__header {
  padding: 0;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}

.sessions-view__title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #cdd6f4;
  padding: 16px;
}

.sessions-view__hint {
  margin: 0;
  padding: 0 16px 16px;
  font-size: 13px;
  color: #a6adc8;
  font-style: italic;
}

.sessions-view__content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.sessions-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #585b70;
}

.sessions-view__empty p {
  margin: 8px 0;
  font-size: 14px;
}

.sessions-view__empty-hint {
  font-size: 12px;
  color: #45475a;
}

.sessions-view__table-wrap {
  border: 1px solid #313244;
  border-radius: 6px;
  overflow: hidden;
}

.sessions-view__table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.sessions-view__table th,
.sessions-view__table td {
  padding: 10px 12px;
  border-bottom: 1px solid #313244;
  font-size: 12px;
  text-align: left;
}

.sessions-view__table th {
  background: #181825;
  color: #a6adc8;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 11px;
}

.sessions-view__row {
  background: #1e1e2e;
  cursor: pointer;
}

.sessions-view__row:hover {
  background: #313244;
}

.sessions-view__row--selected {
  background: #2b3042;
}

.sessions-view__name {
  font-weight: 600;
  color: #cdd6f4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sessions-view__id {
  color: #a6adc8;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sessions-view__actions-col {
  width: 160px;
  text-align: right;
}

.sessions-view__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.sessions-view__view-btn {
  background: #89b4fa;
  color: #1e1e2e;
  border: none;
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.sessions-view__view-btn:hover {
  background: #b4befe;
}

.sessions-view__view-btn:active {
  transform: scale(0.98);
}

.sessions-view__icon-btn {
  background: #313244;
  color: #cdd6f4;
  border: 1px solid #45475a;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
}

.sessions-view__icon-btn--danger {
  color: #f38ba8;
  border-color: #f38ba8;
}
</style>


