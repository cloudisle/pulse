import { GenerationStrategy } from './generation'

export type BuiltInType = 'string' | 'integer' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export interface DataTypeRef {
  type: BuiltInType | string; // built-in type name or custom type ID
  customTypeId?: string; // FK → CustomDataType (when using a custom type)
}

export interface SchemaConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string; // regex
  enum?: any[]; // allowed values
  format?: string; // OpenAPI format hint (e.g. "date-time", "email")
}

export interface SchemaElement {
  name: string; // field name / JSON key
  description?: string;
  required: boolean;
  dataType: DataTypeRef; // reference to a built-in or custom type
  generationStrategy: GenerationStrategy;
  children?: SchemaElement[]; // nested elements (for object / array types)
  constraints?: SchemaConstraints; // optional validation constraints
}

export interface Schema {
  id: string; // UUID
  systemId: string; // FK → System
  name: string;
  description?: string;
  elements: SchemaElement[]; // top-level fields; can be nested
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface CustomDataType {
  id: string; // UUID
  systemId: string; // FK → System
  name: string; // e.g. "PhoneNumber", "AccountId"
  baseType: BuiltInType; // the underlying primitive
  defaultStrategy: GenerationStrategy; // default generation config for this type
  constraints?: SchemaConstraints;
}
