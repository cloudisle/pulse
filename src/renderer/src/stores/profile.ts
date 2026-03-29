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

  function reorderProfile(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= activeProfileIds.value.length ||
      toIndex >= activeProfileIds.value.length ||
      fromIndex === toIndex
    ) {
      return
    }
    const ids = [...activeProfileIds.value]
    const [moved] = ids.splice(fromIndex, 1)
    ids.splice(toIndex, 0, moved)
    activeProfileIds.value = ids
  }

  return { availableProfiles, activeProfileIds, list, setProfiles, toggleProfile, reorderProfile }
})
