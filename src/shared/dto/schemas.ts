import { SchemaElement } from '@shared/models/schema'

export interface CreateSchemaInput {
  systemId: string;
  name: string;
  description?: string;
  elements: SchemaElement[];
}

export interface UpdateSchemaInput {
  name?: string;
  description?: string;
  elements?: SchemaElement[];
}
