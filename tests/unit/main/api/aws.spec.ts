import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/userData')
  }
}))

// Mock fs so we can control file contents without touching the real disk
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn()
    }
  }
})

// Shared send mock so individual tests can change its behaviour
const mockSend = vi.fn()

// Mock STSClient so validateCredentials doesn't hit real AWS
vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: vi.fn(function () {
    return { send: mockSend }
  }),
  GetCallerIdentityCommand: vi.fn()
}))

vi.mock('@aws-sdk/credential-providers', () => ({
  fromIni: vi.fn()
}))

import { promises as fs } from 'fs'
import { AwsApi } from '@main/api/aws'

const readFileMock = fs.readFile as ReturnType<typeof vi.fn>

const CREDENTIALS_FILE = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

[dev]
aws_access_key_id = AKIAI44QH8DHBEXAMPLE
aws_secret_access_key = je7MtGbClwBF/2Zp9Utk/h3yCo8nvbEXAMPLEKEY
`

const CONFIG_FILE = `
[default]
region = us-east-1
output = json

[profile staging]
region = eu-west-1
output = json

[profile prod]
region = us-west-2
`

let api: AwsApi
let savedEnv: NodeJS.ProcessEnv

beforeEach(() => {
  api = new AwsApi()
  savedEnv = { ...process.env }

  // Clear AWS env vars by default
  delete process.env.AWS_ACCESS_KEY_ID
  delete process.env.AWS_SECRET_ACCESS_KEY
  delete process.env.AWS_PROFILE

  readFileMock.mockReset()
  mockSend.mockReset()
})

afterEach(() => {
  process.env = savedEnv
})

// ---------------------------------------------------------------------------
// listProfiles
// ---------------------------------------------------------------------------

describe('AwsApi — listProfiles', () => {
  it('discovers profiles from credentials file', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.resolve(CREDENTIALS_FILE)
      return Promise.reject(new Error('ENOENT'))
    })

    const profiles = await api.listProfiles()

    expect(profiles).toContainEqual({ name: 'default', source: 'credentials-file' })
    expect(profiles).toContainEqual({ name: 'dev', source: 'credentials-file' })
  })

  it('discovers profiles from config file', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.reject(new Error('ENOENT'))
      if (String(p).endsWith('config')) return Promise.resolve(CONFIG_FILE)
      return Promise.reject(new Error('ENOENT'))
    })

    const profiles = await api.listProfiles()

    expect(profiles).toContainEqual({ name: 'default', source: 'config-file', region: 'us-east-1' })
    expect(profiles).toContainEqual({ name: 'staging', source: 'config-file', region: 'eu-west-1' })
    expect(profiles).toContainEqual({ name: 'prod', source: 'config-file', region: 'us-west-2' })
  })

  it('strips the "profile " prefix from config file section names', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.reject(new Error('ENOENT'))
      if (String(p).endsWith('config')) return Promise.resolve('[profile my-profile]\nregion = ap-southeast-1\n')
      return Promise.reject(new Error('ENOENT'))
    })

    const profiles = await api.listProfiles()

    expect(profiles).toContainEqual({ name: 'my-profile', source: 'config-file', region: 'ap-southeast-1' })
    expect(profiles.find((p) => p.name === 'profile my-profile')).toBeUndefined()
  })

  it('detects a profile from environment variables with AWS_PROFILE', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'))
    process.env.AWS_PROFILE = 'my-env-profile'

    const profiles = await api.listProfiles()

    expect(profiles).toContainEqual({ name: 'my-env-profile', source: 'environment' })
  })

  it('uses "default" name for environment profile when AWS_PROFILE is not set', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'))
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'
    process.env.AWS_SECRET_ACCESS_KEY = 'secret'

    const profiles = await api.listProfiles()

    expect(profiles).toContainEqual({ name: 'default', source: 'environment' })
  })

  it('deduplicates: credentials-file takes priority over config-file', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.resolve(CREDENTIALS_FILE)
      if (String(p).endsWith('config')) return Promise.resolve(CONFIG_FILE)
      return Promise.reject(new Error('ENOENT'))
    })

    const profiles = await api.listProfiles()
    const defaultProfiles = profiles.filter((p) => p.name === 'default')

    expect(defaultProfiles).toHaveLength(1)
    expect(defaultProfiles[0].source).toBe('credentials-file')
  })

  it('deduplicates: credentials-file takes priority over environment', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.resolve(CREDENTIALS_FILE)
      return Promise.reject(new Error('ENOENT'))
    })
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE'

    const profiles = await api.listProfiles()
    const defaultProfiles = profiles.filter((p) => p.name === 'default')

    expect(defaultProfiles).toHaveLength(1)
    expect(defaultProfiles[0].source).toBe('credentials-file')
  })

  it('deduplicates: config-file takes priority over environment', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.reject(new Error('ENOENT'))
      if (String(p).endsWith('config')) return Promise.resolve(CONFIG_FILE)
      return Promise.reject(new Error('ENOENT'))
    })
    process.env.AWS_ACCESS_KEY_ID = 'key'

    const profiles = await api.listProfiles()
    const defaultProfiles = profiles.filter((p) => p.name === 'default')

    expect(defaultProfiles).toHaveLength(1)
    expect(defaultProfiles[0].source).toBe('config-file')
  })

  it('returns empty array when no files exist and no env vars are set', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'))

    const profiles = await api.listProfiles()

    expect(profiles).toEqual([])
  })

  it('returns profiles from all three sources when names differ', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials'))
        return Promise.resolve('[cred-profile]\naws_access_key_id = KEY\n')
      if (String(p).endsWith('config'))
        return Promise.resolve('[profile config-profile]\nregion = eu-central-1\n')
      return Promise.reject(new Error('ENOENT'))
    })
    process.env.AWS_PROFILE = 'env-profile'

    const profiles = await api.listProfiles()
    const names = profiles.map((p) => p.name)

    expect(names).toContain('cred-profile')
    expect(names).toContain('config-profile')
    expect(names).toContain('env-profile')
  })

  it('does not add environment profile when no AWS env vars are set', async () => {
    readFileMock.mockRejectedValue(new Error('ENOENT'))

    const profiles = await api.listProfiles()

    expect(profiles.find((p) => p.source === 'environment')).toBeUndefined()
  })

  it('ignores comment lines in INI files', async () => {
    const withComments = `
# This is a comment
; Another comment
[myprofile]
aws_access_key_id = KEY
`
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.resolve(withComments)
      return Promise.reject(new Error('ENOENT'))
    })

    const profiles = await api.listProfiles()

    expect(profiles).toContainEqual({ name: 'myprofile', source: 'credentials-file' })
    expect(profiles).toHaveLength(1)
  })

  it('does not include region when not present in config', async () => {
    readFileMock.mockImplementation((p: string) => {
      if (String(p).endsWith('credentials')) return Promise.reject(new Error('ENOENT'))
      if (String(p).endsWith('config')) return Promise.resolve('[profile no-region]\noutput = json\n')
      return Promise.reject(new Error('ENOENT'))
    })

    const profiles = await api.listProfiles()

    expect(profiles[0].region).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// validateCredentials
// ---------------------------------------------------------------------------

describe('AwsApi — validateCredentials', () => {
  it('returns valid identity when STS call succeeds', async () => {
    mockSend.mockResolvedValue({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/test-user',
      UserId: 'AIDIODR4TAW7CSEXAMPLE'
    })

    const result = await api.validateCredentials('default')

    expect(result.valid).toBe(true)
    expect(result.identity).toEqual({
      account: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/test-user'
    })
    expect(result.error).toBeUndefined()
  })

  it('returns valid: false with error message when STS call fails', async () => {
    mockSend.mockRejectedValue(new Error('InvalidClientTokenId'))

    const result = await api.validateCredentials('bad-profile')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('InvalidClientTokenId')
    expect(result.identity).toBeUndefined()
  })

  it('returns valid: false with stringified error for non-Error rejections', async () => {
    mockSend.mockRejectedValue('ExpiredTokenException')

    const result = await api.validateCredentials('expired-profile')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('ExpiredTokenException')
  })
})
