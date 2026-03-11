export type StrategyType =
  | 'random' // fully random within constraints
  | 'faker' // use a faker.js method
  | 'enum' // pick from a list
  | 'pattern' // regex-based generation
  | 'range' // numeric range
  | 'constant' // always the same value
  | 'template'; // string template with {{ variable }} interpolation

export interface RandomConfig {} // uses type + constraints

export interface FakerConfig {
  method: string; // e.g. "person.firstName"
  locale?: string;
}

export interface EnumConfig {
  values: any[];
}

export interface PatternConfig {
  pattern: string; // e.g. "[A-Z]{3}-\\d{4}"
}

export interface RangeConfig {
  min: number;
  max: number;
  step?: number;
  decimals?: number;
}

export interface ConstantConfig {
  value: any;
}

export interface TemplateConfig {
  template: string; // e.g. "ORD-{{ uuid }}"
}

export interface GenerationStrategy {
  type: StrategyType;
  config:
    | RandomConfig
    | FakerConfig
    | EnumConfig
    | PatternConfig
    | RangeConfig
    | ConstantConfig
    | TemplateConfig;
}
