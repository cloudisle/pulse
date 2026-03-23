import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Profile {
  id: string
  name: string
}

export const useProfileStore = defineStore('profile', () => {
  const availableProfiles = ref<Profile[]>([])
  const activeProfileIds = ref<string[]>([])

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

  return { availableProfiles, activeProfileIds, setProfiles, toggleProfile }
})
