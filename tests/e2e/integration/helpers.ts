/**
 * Shared test utilities for e2e integration tests.
 * Provides helpers for launching the Electron app, creating MiniStack Kinesis
 * streams, and other common operations used across test files.
 */

import { type ElectronApplication, type Page, _electron as electron } from 'playwright'
import {
  KinesisClient,
  CreateStreamCommand,
  DescribeStreamCommand,
  PutRecordCommand,
} from '@aws-sdk/client-kinesis'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import http from 'http'
import path from 'path'
import { MINISTACK_ENDPOINT, AWS_CREDENTIALS_FILE, XVFB_DISPLAY_ENV } from '../global-setup'

export const APP_MAIN = path.join(__dirname, '../../../out/main/index.js')

/** Number of polling attempts when waiting for a Kinesis stream to become ACTIVE. */
export const STREAM_POLL_ATTEMPTS = 20
/** Delay between Kinesis stream status polling attempts (ms). */
export const STREAM_POLL_DELAY_MS = 300

/** Number of polling attempts when waiting for a listener to receive an event. */
export const LISTENER_RECEIVE_POLL_ATTEMPTS = 30
/** Delay between listener receive polling attempts (ms). */
export const LISTENER_RECEIVE_POLL_DELAY_MS = 500

export function makeKinesisClient(): KinesisClient {
  return new KinesisClient({
    region: 'us-east-1',
    endpoint: MINISTACK_ENDPOINT,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    requestHandler: new NodeHttpHandler({ httpAgent: new http.Agent({ keepAlive: false }) }),
  })
}

export async function createStream(client: KinesisClient, streamName: string): Promise<void> {
  await client.send(new CreateStreamCommand({ StreamName: streamName, ShardCount: 1 }))
  for (let i = 0; i < STREAM_POLL_ATTEMPTS; i++) {
    const desc = await client.send(new DescribeStreamCommand({ StreamName: streamName }))
    if (desc.StreamDescription?.StreamStatus === 'ACTIVE') return
    await sleep(STREAM_POLL_DELAY_MS)
  }
  throw new Error(`Stream ${streamName} did not become ACTIVE`)
}

export async function putRecord(
  client: KinesisClient,
  streamName: string,
  payload: object
): Promise<void> {
  await client.send(
    new PutRecordCommand({
      StreamName: streamName,
      Data: Buffer.from(JSON.stringify(payload)),
      PartitionKey: 'pk',
    })
  )
}

export async function launchApp(
  userDataDir: string
): Promise<{ app: ElectronApplication; page: Page }> {
  const display = process.env[XVFB_DISPLAY_ENV] ?? process.env.DISPLAY ?? ''
  const electronApp = await electron.launch({
    args: ['--no-sandbox', `--user-data-dir=${userDataDir}`, APP_MAIN],
    env: {
      ...process.env,
      DISPLAY: display,
      AWS_ENDPOINT_URL: MINISTACK_ENDPOINT,
      AWS_SHARED_CREDENTIALS_FILE: AWS_CREDENTIALS_FILE,
      AWS_DEFAULT_REGION: 'us-east-1',
    },
  })
  const page = await electronApp.firstWindow()
  return { app: electronApp, page }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
