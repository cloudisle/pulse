export interface AWSProfile {
  name: string;
  source: 'credentials-file' | 'config-file' | 'environment' | 'iam-role';
  region?: string;
}

export interface AwsOperationSettings {
  profile: string;
}

export interface CloudOperationSettings {
  aws?: AwsOperationSettings;
}

export interface CredentialValidation {
  valid: boolean;
  identity?: {
    account: string;
    arn: string;
  };
  error?: string;
}
