import type { AWSProfile, CredentialValidation } from '@shared/models/aws'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts'
import { fromIni } from '@aws-sdk/credential-providers'

function parseIni(content: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  let currentSection: string | null = null

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue
    }
    const sectionMatch = trimmed.match(/^\[(.+)\]$/)
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim()
      result[currentSection] = {}
    } else if (currentSection !== null) {
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim()
        const value = trimmed.substring(eqIdx + 1).trim()
        result[currentSection][key] = value
      }
    }
  }

  return result
}

export class AwsApi {

  async listProfiles(): Promise<AWSProfile[]> {
    const profileMap = new Map<string, AWSProfile>()

    // 1. Credentials file (~/.aws/credentials)
    try {
      const credPath = path.join(os.homedir(), '.aws', 'credentials')
      const content = await fs.readFile(credPath, 'utf-8')
      const sections = parseIni(content)
      for (const name of Object.keys(sections)) {
        profileMap.set(name, { name, source: 'credentials-file' })
      }
    } catch {
      // file doesn't exist or cannot be read
    }

    // 2. Config file (~/.aws/config)
    try {
      const configPath = path.join(os.homedir(), '.aws', 'config')
      const content = await fs.readFile(configPath, 'utf-8')
      const sections = parseIni(content)
      for (const [sectionName, values] of Object.entries(sections)) {
        // Strip "profile " prefix; the default section has no prefix
        const name = sectionName.startsWith('profile ')
          ? sectionName.substring('profile '.length).trim()
          : sectionName

        if (!profileMap.has(name)) {
          const profile: AWSProfile = { name, source: 'config-file' }
          if (values.region) {
            profile.region = values.region
          }
          profileMap.set(name, profile)
        }
      }
    } catch {
      // file doesn't exist or cannot be read
    }

    // 3. Environment variables
    const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_PROFILE } = process.env
    if (AWS_ACCESS_KEY_ID || AWS_SECRET_ACCESS_KEY || AWS_PROFILE) {
      const envProfileName = AWS_PROFILE ?? 'default'
      if (!profileMap.has(envProfileName)) {
        profileMap.set(envProfileName, { name: envProfileName, source: 'environment' })
      }
    }

    return Array.from(profileMap.values())
  }

  async validateCredentials(profileName: string): Promise<CredentialValidation> {
    try {
      const client = new STSClient({
        credentials: fromIni({ profile: profileName })
      })
      const response = await client.send(new GetCallerIdentityCommand({}))
      return {
        valid: true,
        identity: {
          account: response.Account ?? '',
          arn: response.Arn ?? ''
        }
      }
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
