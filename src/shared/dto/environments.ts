import { EnvironmentVariable } from '../models'

export interface CreateEnvInput {
  systemId: string;
  name: string;
  variables: EnvironmentVariable[];
}

export interface UpdateEnvInput {
  name?: string;
  variables?: EnvironmentVariable[];
}
