import { spawnSync } from 'child_process'
import { rmSync, existsSync } from 'fs'
import {
  MINISTACK_CONTAINER_NAME,
  AWS_CREDENTIALS_FILE,
  AWS_CONFIG_FILE,
  AWS_CREDENTIAL_PROCESS_SCRIPT,
  AWS_CREDENTIAL_PROCESS_STATE,
  XVFB_DISPLAY_ENV
} from './global-setup'

export default function globalTeardown(): void {
  // Stop and remove the MiniStack container
  spawnSync('docker', ['rm', '-f', MINISTACK_CONTAINER_NAME], { stdio: 'ignore' })

  // Remove the test credentials file
  if (existsSync(AWS_CREDENTIALS_FILE)) {
    rmSync(AWS_CREDENTIALS_FILE, { force: true })
  }
  if (existsSync(AWS_CONFIG_FILE)) {
    rmSync(AWS_CONFIG_FILE, { force: true })
  }
  if (existsSync(AWS_CREDENTIAL_PROCESS_SCRIPT)) {
    rmSync(AWS_CREDENTIAL_PROCESS_SCRIPT, { force: true })
  }
  if (existsSync(AWS_CREDENTIAL_PROCESS_STATE)) {
    rmSync(AWS_CREDENTIAL_PROCESS_STATE, { force: true })
  }

  // Kill the Xvfb instance if we started it
  const xvfbDisplay = process.env[XVFB_DISPLAY_ENV]
  if (xvfbDisplay) {
    spawnSync('pkill', ['-f', `Xvfb ${xvfbDisplay}`], { stdio: 'ignore' })
  }
}
