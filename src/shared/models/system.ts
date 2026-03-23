export type ContentType = 'string' | 'json';
export type InputType = 'kinesis' | 'sqs' | 'eventbridge';
export type OutputType = 'kinesis' | 'sqs';

export interface KinesisConfig {
  streamName: string; // supports {{ variable }} replacement
  region?: string; // supports {{ variable }} replacement
  partitionKey?: string; // supports {{ variable }} replacement
  pollInterval?: number;
}

export interface SqsConfig {
  queueUrl: string; // supports {{ variable }} replacement
  region: string; // supports {{ variable }} replacement
}

export interface EventBridgeConfig {
  eventBusName: string; // supports {{ variable }} replacement
  region: string; // supports {{ variable }} replacement
  source: string; // supports {{ variable }} replacement
  detailType: string; // supports {{ variable }} replacement
}

export interface InputConfig {
  id: string; // UUID
  name: string;
  type: InputType;
  config: KinesisConfig | SqsConfig | EventBridgeConfig;
}

export interface OutputConfig {
  id: string; // UUID
  name: string;
  type: OutputType;
  config: KinesisConfig | SqsConfig;
  contentType: ContentType;
}

export interface System {
  id: string; // UUID
  name: string;
  description?: string;
  inputs: InputConfig[]; // configured destinations for sending events
  outputs: OutputConfig[]; // configured sources for listening
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
