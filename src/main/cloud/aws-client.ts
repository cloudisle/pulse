import { fromIni } from '@aws-sdk/credential-providers'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import http from 'http'

const SESSION_EXPIRED_ERROR_NAMES = new Set([
  'ExpiredToken',
  'ExpiredTokenException',
  'RequestExpired',
  'InvalidClientTokenId',
  'UnrecognizedClientException',
  'CredentialsProviderError'
])

export function buildAwsClientConfig(profile: string): {
  credentials: ReturnType<typeof fromIni>
  endpoint?: string
  requestHandler?: NodeHttpHandler
} {
  const endpointUrl = process.env.AWS_ENDPOINT_URL

  return {
    credentials: fromIni({ profile }),
    ...(endpointUrl
      ? {
          endpoint: endpointUrl,
          requestHandler: new NodeHttpHandler({
            httpAgent: new http.Agent({ keepAlive: false })
          })
        }
      : {})
  }
}

export function isAwsSessionExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  if (SESSION_EXPIRED_ERROR_NAMES.has(error.name)) {
    return true
  }

  const message = error.message.toLowerCase()
  return (
    message.includes('session has expired') ||
    message.includes('expired token') ||
    message.includes('security token included in the request is expired')
  )
}

