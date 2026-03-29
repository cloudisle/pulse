import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Profile {
  id: string
  name: string
}

export const useProfileStore = defineStore('profile', () => {
  const availableProfiles = ref<Profile[]>([])
  const activeProfileIds = ref<string[]>([])

  async function list(systemId: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    const items: { id: string; name: string }[] = await api.profiles.list(systemId)
    availableProfiles.value = items.map(({ id, name }) => ({ id, name }))
  }

  function setProfiles(profiles: Profile[]): void {
    availableProfiles.value = profiles
  }

  function toggleProfile(id: string): void {
    const idx = activeProfileIds.value.indexOf(id)
    if (idx === -1) {
      activeProfileIds.value.push(id)
    } else {
      activeProfileIds.value.splice(idx, 1)
    }
  }

  function moveProfileUp(id: string): void {
    const idx = activeProfileIds.value.indexOf(id)
    if (idx <= 0) return
    const arr = [...activeProfileIds.value]
    ;[arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]
    activeProfileIds.value = arr
  }

  function moveProfileDown(id: string): void {
    const idx = activeProfileIds.value.indexOf(id)
    if (idx === -1 || idx >= activeProfileIds.value.length - 1) return
    const arr = [...activeProfileIds.value]
    ;[arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]
    activeProfileIds.value = arr
  }

  function reorderProfiles(orderedIds: string[]): void {
    activeProfileIds.value = orderedIds.filter((id) => activeProfileIds.value.includes(id))
  }

  return {
    availableProfiles,
    activeProfileIds,
    list,
    setProfiles,
    toggleProfile,
    moveProfileUp,
    moveProfileDown,
    reorderProfiles
  }
})
