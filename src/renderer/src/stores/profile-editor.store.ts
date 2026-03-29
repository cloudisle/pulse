import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Profile } from '../../../shared/models/profile'

export const useProfileEditorStore = defineStore('profileEditor', () => {
  const workingProfile = ref<Profile | null>(null)
  const savedProfile = ref<Profile | null>(null)
  const samplePayload = ref<string | null>(null)

  const isDirty = computed(() => {
    if (!workingProfile.value && !savedProfile.value) return false
    if (!workingProfile.value || !savedProfile.value) return true
    return JSON.stringify(workingProfile.value) !== JSON.stringify(savedProfile.value)
  })

  function load(profile: Profile): void {
    savedProfile.value = JSON.parse(JSON.stringify(profile))
    workingProfile.value = JSON.parse(JSON.stringify(profile))
    samplePayload.value = null
  }

  function initNew(systemId: string): void {
    const now = new Date().toISOString()
    workingProfile.value = {
      id: '',
      systemId,
      name: '',
      description: '',
      overrides: [],
      createdAt: now,
      updatedAt: now
    }
    savedProfile.value = null
    samplePayload.value = null
  }

  function markSaved(profile: Profile): void {
    savedProfile.value = JSON.parse(JSON.stringify(profile))
    if (workingProfile.value) {
      workingProfile.value.id = profile.id
      workingProfile.value.createdAt = profile.createdAt
      workingProfile.value.updatedAt = profile.updatedAt
    }
  }

  function reset(): void {
    workingProfile.value = null
    savedProfile.value = null
    samplePayload.value = null
  }

  return {
    workingProfile,
    savedProfile,
    samplePayload,
    isDirty,
    load,
    initNew,
    markSaved,
    reset
  }
})
