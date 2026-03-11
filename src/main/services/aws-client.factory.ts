import { KinesisClient } from '@aws-sdk/client-kinesis'
import { SQSClient } from '@aws-sdk/client-sqs'
import { EventBridgeClient } from '@aws-sdk/client-eventbridge'
import { fromIni } from '@aws-sdk/credential-providers'

export class AwsClientFactory {
  createKinesisClient(profile: string, region: string): KinesisClient {
    return new KinesisClient({
      region,
      credentials: fromIni({ profile })
    })
  }

  createSqsClient(profile: string, region: string): SQSClient {
    return new SQSClient({
      region,
      credentials: fromIni({ profile })
    })
  }

  createEventBridgeClient(profile: string, region: string): EventBridgeClient {
    return new EventBridgeClient({
      region,
      credentials: fromIni({ profile })
    })
  }
}
