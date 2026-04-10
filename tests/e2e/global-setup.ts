import { spawnSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import * as http from 'http'
import * as path from 'path'

export const MINISTACK_PORT = 4566
export const MINISTACK_IMAGE = 'nahuelnucera/ministack'
export const MINISTACK_CONTAINER_NAME = 'pulse-e2e-ministack'
export const MINISTACK_ENDPOINT = `http://localhost:${MINISTACK_PORT}`
export const AWS_CREDENTIALS_FILE = '/tmp/pulse-e2e-aws-credentials'
export const AWS_CONFIG_FILE = '/tmp/pulse-e2e-aws-config'
export const AWS_CREDENTIAL_PROCESS_SCRIPT = '/tmp/pulse-e2e-credential-process.cjs'
export const AWS_CREDENTIAL_PROCESS_STATE = '/tmp/pulse-e2e-credential-process-state.json'
export const AWS_REFRESH_PROFILE = 'refresh-profile'

/** Environment variable key used to record whether we started Xvfb. */
export const XVFB_DISPLAY_ENV = 'PULSE_E2E_XVFB_DISPLAY'

export default async function globalSetup(): Promise<void> {
  // Start a virtual display when none is available (e.g. CI)
  if (!process.env.DISPLAY) {
    const display = ':99'
    spawnSync('Xvfb', [display, '-screen', '0', '1024x768x24'], {
      stdio: 'ignore',
    })
    process.env[XVFB_DISPLAY_ENV] = display
    await sleep(500)
  }

  // Write test AWS credentials file with the profiles used in tests
  mkdirSync(path.dirname(AWS_CREDENTIALS_FILE), { recursive: true })
  writeFileSync(
    AWS_CREDENTIALS_FILE,
    [
      '[default]',
      'aws_access_key_id = test',
      'aws_secret_access_key = test',
      '',
      '[staging-profile]',
      'aws_access_key_id = test',
      'aws_secret_access_key = test',
      '',
      '[test-profile]',
      'aws_access_key_id = test',
      'aws_secret_access_key = test',
    ].join('\n')
  )

  // Write shared config file with a credential_process-backed profile.
  writeFileSync(
    AWS_CONFIG_FILE,
    [
      '[default]',
      'region = us-east-1',
      '',
      '[profile staging-profile]',
      'region = us-east-1',
      '',
      '[profile test-profile]',
      'region = us-east-1',
      '',
      `[profile ${AWS_REFRESH_PROFILE}]`,
      'region = us-east-1',
      `credential_process = node ${AWS_CREDENTIAL_PROCESS_SCRIPT}`,
    ].join('\n')
  )

  // Initial credential-process state is "expired" so first attempt fails.
  writeFileSync(
    AWS_CREDENTIAL_PROCESS_STATE,
    JSON.stringify({ mode: 'expired' })
  )

  // credential_process script: returns expired error or valid session JSON.
  writeFileSync(
    AWS_CREDENTIAL_PROCESS_SCRIPT,
    [
      "const fs = require('fs')",
      `const stateFile = '${AWS_CREDENTIAL_PROCESS_STATE}'`,
      "let mode = 'expired'",
      'try {',
      "  const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))",
      "  mode = data && typeof data.mode === 'string' ? data.mode : 'expired'",
      '} catch (error) {',
      "  mode = 'expired'",
      '}',
      "if (mode !== 'valid') {",
      "  process.stderr.write('Your session has expired\\n')",
      '  process.exit(1)',
      '}',
      'process.stdout.write(JSON.stringify({',
      "  Version: 1,",
      "  AccessKeyId: 'test',",
      "  SecretAccessKey: 'test',",
      "  SessionToken: 'test-session',",
      "  Expiration: '2099-01-01T00:00:00.000Z'",
      '}))',
    ].join('\n')
  )

  // Remove any leftover container from a previous run
  spawnSync('docker', ['rm', '-f', MINISTACK_CONTAINER_NAME], { stdio: 'ignore' })

  // Start MiniStack container
  const result = spawnSync(
    'docker',
    [
      'run', '-d',
      '--name', MINISTACK_CONTAINER_NAME,
      '-p', `${MINISTACK_PORT}:4566`,
      MINISTACK_IMAGE,
    ],
    { stdio: 'pipe' }
  )

  if (result.status !== 0) {
    throw new Error(`Failed to start MiniStack: ${result.stderr?.toString()}`)
  }

  // Wait until MiniStack is healthy
  await waitForMiniStack()
}

async function waitForMiniStack(maxAttempts = 30, delayMs = 2000): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ready = await checkHealth()
    if (ready) return
    await sleep(delayMs)
  }
  throw new Error(`MiniStack did not become healthy after ${maxAttempts} attempts`)
}

function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${MINISTACK_PORT}/_localstack/health`, (res) => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(1000, () => { req.destroy(); resolve(false) })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
