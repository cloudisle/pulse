import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAwsStore = defineStore('aws', () => {
  const availableProfiles = ref<string[]>([])
  const selectedProfile = ref<string | null>(null)

  function setProfiles(profiles: string[]): void {
    availableProfiles.value = profiles
  }

  function selectProfile(profile: string): void {
    selectedProfile.value = profile
  }

  return { availableProfiles, selectedProfile, setProfiles, selectProfile }
})
