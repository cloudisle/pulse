import { SchemaElement } from '../models/schema'

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
