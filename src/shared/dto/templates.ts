import { TemplateField } from '../models/template'

export interface CreateTemplateInput {
  systemId: string;
  folderId: string | null;
  name: string;
  description?: string;
  schemaId: string;
  inputId: string;
  profileIds: string[];
  fields: TemplateField[];
}

export interface UpdateTemplateInput {
  folderId?: string | null;
  name?: string;
  description?: string;
  schemaId?: string;
  inputId?: string;
  profileIds?: string[];
  fields?: TemplateField[];
}
