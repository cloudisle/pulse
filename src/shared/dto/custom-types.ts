import type { BuiltInType, SchemaConstraints } from '../models/schema'
import type { GenerationStrategy } from '../models/generation'

export interface CreateCustomTypeInput {
  systemId: string;
  name: string;
  baseType: BuiltInType;
  defaultStrategy: GenerationStrategy;
  constraints?: SchemaConstraints;
}

export interface UpdateCustomTypeInput {
  name?: string;
  baseType?: BuiltInType;
  defaultStrategy?: GenerationStrategy;
  constraints?: SchemaConstraints;
}
