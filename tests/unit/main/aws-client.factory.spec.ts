import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AwsClientFactory } from '../../../src/main/services/aws-client.factory'
import { KinesisClient } from '@aws-sdk/client-kinesis'
import { SQSClient } from '@aws-sdk/client-sqs'
import { EventBridgeClient } from '@aws-sdk/client-eventbridge'

vi.mock('@aws-sdk/client-kinesis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-kinesis')>()
  return {
    ...actual,
    KinesisClient: vi.fn(function () {
      return { send: vi.fn() }
    })
  }
})

vi.mock('@aws-sdk/client-sqs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-sqs')>()
  return {
    ...actual,
    SQSClient: vi.fn(function () {
      return { send: vi.fn() }
    })
  }
})

vi.mock('@aws-sdk/client-eventbridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-eventbridge')>()
  return {
    ...actual,
    EventBridgeClient: vi.fn(function () {
      return { send: vi.fn() }
    })
  }
})

vi.mock('@aws-sdk/credential-providers', () => ({
  fromIni: vi.fn().mockReturnValue({})
}))

describe('AwsClientFactory', () => {
  let factory: AwsClientFactory

  beforeEach(() => {
    vi.clearAllMocks()
    factory = new AwsClientFactory()
  })

  describe('createKinesisClient', () => {
    it('creates a KinesisClient with the given profile and region', () => {
      const client = factory.createKinesisClient('my-profile', 'us-east-1')
      expect(KinesisClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-east-1' })
      )
      expect(client).toBeDefined()
    })

    it('uses fromIni with the specified profile', async () => {
      const { fromIni } = await import('@aws-sdk/credential-providers')
      factory.createKinesisClient('test-profile', 'eu-west-1')
      expect(fromIni).toHaveBeenCalledWith({ profile: 'test-profile' })
    })
  })

  describe('createSqsClient', () => {
    it('creates an SQSClient with the given profile and region', () => {
      const client = factory.createSqsClient('my-profile', 'us-west-2')
      expect(SQSClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'us-west-2' })
      )
      expect(client).toBeDefined()
    })

    it('uses fromIni with the specified profile', async () => {
      const { fromIni } = await import('@aws-sdk/credential-providers')
      factory.createSqsClient('sqs-profile', 'ap-southeast-1')
      expect(fromIni).toHaveBeenCalledWith({ profile: 'sqs-profile' })
    })
  })

  describe('createEventBridgeClient', () => {
    it('creates an EventBridgeClient with the given profile and region', () => {
      const client = factory.createEventBridgeClient('my-profile', 'eu-central-1')
      expect(EventBridgeClient).toHaveBeenCalledWith(
        expect.objectContaining({ region: 'eu-central-1' })
      )
      expect(client).toBeDefined()
    })

    it('uses fromIni with the specified profile', async () => {
      const { fromIni } = await import('@aws-sdk/credential-providers')
      factory.createEventBridgeClient('eb-profile', 'us-east-2')
      expect(fromIni).toHaveBeenCalledWith({ profile: 'eb-profile' })
    })
  })
})
