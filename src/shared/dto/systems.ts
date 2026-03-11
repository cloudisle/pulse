import { InputConfig, OutputConfig, System } from '../models/system'
import { Schema } from '../models/schema'
import { Environment } from '../models/environment'
import { Profile } from '../models/profile'
import { Template, TemplateFolder } from '../models/template'

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
  folders: TemplateFolder[];
}
