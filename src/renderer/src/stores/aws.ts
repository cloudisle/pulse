import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface CredentialValidationResult {
  valid: boolean
  identity?: { account: string; arn: string }
  error?: string
}

export const useAwsStore = defineStore('aws', () => {
  const availableProfiles = ref<string[]>([])
  const selectedProfile = ref<string | null>(null)
  const loadingProfiles = ref(false)
  const validating = ref(false)
  const validationResult = ref<CredentialValidationResult | null>(null)

  function setProfiles(profiles: string[]): void {
    availableProfiles.value = profiles
  }

  function selectProfile(profile: string): void {
    selectedProfile.value = profile
    validationResult.value = null
  }

  async function loadProfiles(): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    loadingProfiles.value = true
    try {
      const profiles: { name: string }[] = await api.aws.listProfiles()
      const profileNames = profiles.map((p) => p.name)
      availableProfiles.value = profileNames

      if (selectedProfile.value && !profileNames.includes(selectedProfile.value)) {
        selectedProfile.value = null
        validationResult.value = null
      }
    } finally {
      loadingProfiles.value = false
    }
  }

  async function validateCredentials(profileName: string): Promise<void> {
    const api = (window as any).app?.api
    if (!api) return
    validating.value = true
    validationResult.value = null
    try {
      const result = await api.aws.validateCredentials(profileName)
      validationResult.value = result
    } finally {
      validating.value = false
    }
  }

  return {
    availableProfiles,
    selectedProfile,
    loadingProfiles,
    validating,
    validationResult,
    setProfiles,
    selectProfile,
    loadProfiles,
    validateCredentials
  }
})
