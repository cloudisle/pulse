import type {
  CustomDataType,
  ListenerDataEvent,
  ListenerErrorEvent,
  ListenerLifecycleEvent, Profile, Template,
  TemplateFolder, TemplateTree
} from '../models'
import type { AppSettings, Environment, LogEntry } from '../models'
import {System} from "../models";
import {
  CreateEnvInput, CreateProfileInput,
  CreateSchemaInput,
  CreateSystemInput,
  CreateTemplateInput,
  UpdateEnvInput,
  UpdateSchemaInput
} from "../dto";
import {CreateCustomTypeInput, UpdateCustomTypeInput} from "../dto/custom-types";
import {ProfilesApi} from "../../main/api/profiles";
import {TemplatesApi} from "../../main/api/templates";
import {CustomTypesApi} from "../../main/api/custom-types";
import {EnvironmentsApi} from "../../main/api/environments";
import {SchemasApi} from "../../main/api/schemas";
import {SystemsApi} from "../../main/api/systems";
import {AppApi} from "../../main/api/app";
import {SessionsApi} from "../../main/api/sessions";
import {AwsApi} from "../../main/api/aws";

export interface IElectronAPI {
  platform: string

  app: AppApi
  systems: SystemsApi
  schemas: SchemasApi
  environments: EnvironmentsApi
  profiles: ProfilesApi
  templates: TemplatesApi
  customTypes: CustomTypesApi
  sessions: SessionsApi
  aws: AwsApi

  listeners: {
    onLifecycle(callback: (event: ListenerLifecycleEvent) => void): () => void
    onData(callback: (event: ListenerDataEvent) => void): () => void
    onError(callback: (event: ListenerErrorEvent) => void): () => void
  }

  log: {
    onEntry(callback: (entry: LogEntry) => void): () => void
  }
}
