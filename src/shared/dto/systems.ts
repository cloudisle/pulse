import { InputConfig, OutputConfig, System } from '@shared/models/system'
import { CustomDataType, Schema } from '@shared/models/schema'
import { Environment } from '@shared/models/environment'
import { Profile } from '@shared/models/profile'
import { Template, TemplateFolder } from '@shared/models/template'

export interface CreateSystemInput {
  name: string;
  description?: string;
  inputs: Omit<InputConfig, 'id'>[];
  outputs: Omit<OutputConfig, 'id'>[];
}

export interface UpdateSystemInput {
  name?: string;
  description?: string;
  inputs?: InputConfig[];
  outputs?: OutputConfig[];
}

export interface ExportedSystem {
  system: System;
  schemas: Schema[];
  environments: Environment[];
  profiles: Profile[];
  templates: Template[];
  templateFolders: TemplateFolder[];
  customTypes: CustomDataType[];
}
