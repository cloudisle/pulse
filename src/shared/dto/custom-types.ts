import type { BuiltInType, SchemaConstraints } from '@shared/models/schema'
import type { GenerationStrategy } from '@shared/models/generation'

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
