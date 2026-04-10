import type { OverrideAction } from './profile'
import type { GenerationStrategy } from './generation'

export interface TemplateField {
  elementPath: string; // dot-notation path (e.g. "payload.orderId")
  action: OverrideAction; // how to handle this field: set | generate | omit | require | nullify
  value?: any; // the override value (when action is 'set')
  generationStrategy?: GenerationStrategy; // override generation strategy (when action is 'generate')
}

export interface Template {
  id: string; // UUID
  systemId: string; // FK → System
  folderId: string | null; // FK → TemplateFolder (null = root)
  name: string;
  description?: string;
  schemaId: string; // FK → Schema
  inputId: string; // FK → InputConfig (destination)
  profileIds: string[]; // FK[] → Profile (applied in order)
  fields: TemplateField[]; // preset field values
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface TemplateFolder {
  id: string; // UUID
  systemId: string; // FK → System
  parentId: string | null; // FK → TemplateFolder (null = root)
  name: string;
}

/** Recursive tree returned by `templates:list` */
export interface TemplateTree {
  folders: TemplateFolderNode[];
  templates: Template[]; // root-level templates
}

export interface TemplateFolderNode {
  folder: TemplateFolder;
  children: TemplateFolderNode[];
  templates: Template[];
}
