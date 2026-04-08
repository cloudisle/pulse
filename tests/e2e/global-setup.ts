import { spawnSync } from 'child_process'
import { writeFileSync, mkdirSync } from 'fs'
import http from 'http'
import path from 'path'

export const MINISTACK_PORT = 4566
export const MINISTACK_IMAGE = 'nahuelnucera/ministack'
export const MINISTACK_CONTAINER_NAME = 'pulse-e2e-ministack'
export const MINISTACK_ENDPOINT = `http://localhost:${MINISTACK_PORT}`
export const AWS_CREDENTIALS_FILE = '/tmp/pulse-e2e-aws-credentials'

/** Environment variable key used to record whether we started Xvfb. */
export const XVFB_DISPLAY_ENV = 'PULSE_E2E_XVFB_DISPLAY'

export default async function globalSetup(): Promise<void> {
  // Start a virtual display when none is available (e.g. CI)
  if (!process.env.DISPLAY) {
    const display = ':99'
    spawnSync('Xvfb', [display, '-screen', '0', '1024x768x24'], {
      detached: true,
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
