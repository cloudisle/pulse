import { faker, allFakers } from '@faker-js/faker'
import RandExp from 'randexp'
import { VariableReplacementService } from './variable-replacement.service'
import { Schema, SchemaElement, CustomDataType, BuiltInType } from '../../shared/models/schema'
import { Environment } from '../../shared/models/environment'
import { Profile, ProfileOverride } from '../../shared/models/profile'
import { GenerateEventInput, GeneratedEvent, ValidationResult, ValidationWarning } from '../../shared/models/event'
import {
  GenerationStrategy,
  FakerConfig,
  EnumConfig,
  PatternConfig,
  RangeConfig,
  ConstantConfig,
  TemplateConfig
} from '../../shared/models/generation'
import {logger} from "../util/log";

const log = logger('event-generation.service');

export interface GenerateEventProps {
  environment?: Environment
  profiles?: Profile[]
  customTypes?: CustomDataType[]
}

export class EventGenerationService {
  private readonly variables: VariableReplacementService

  constructor() {
    this.variables = new VariableReplacementService()
  }

  async generateEvent(
    input: GenerateEventInput,
    schema: Schema,
    props: GenerateEventProps
  ): Promise<GeneratedEvent> {
    await log.info(input.profileIds?.length
        ? `Generating event from schema ${schema.id} with profiles [${input.profileIds.join(', ')}]`
        : `Generating event from schema ${schema.id}`)

    const profileOverrides = this.resolveProfiles(
      input.profileIds ?? [],
      props.profiles ?? []
    )

    const adHocOverrides = input.overrides ?? {}
    const warnings: ValidationWarning[] = []
    const payload: Record<string, any> = {}

    for (const element of schema.elements) {
      const result = this.generateElement(
        element,
        element.name,
        adHocOverrides,
        profileOverrides,
        props.customTypes ?? [],
        warnings
      )
      if (result !== undefined) {
        payload[element.name] = result
      }
    }

    // Variable replacement using environment variables
    const envVariables: Record<string, string> = {}
    if (props.environment) {
      for (const v of props.environment.variables) {
        envVariables[v.key] = v.value
      }
    }
    const finalPayload = this.variables.replaceVariablesInObject(
      payload,
      envVariables
    ) as Record<string, any>

    // Validate and collect warnings
    this.validatePayload(finalPayload, schema.elements, '', warnings, props.customTypes ?? [])

    const appliedProfiles = (input.profileIds ?? []).filter((id) =>
      (props.profiles ?? []).some((p) => p.id === id)
    )

    return {
      schemaId: schema.id,
      payload: finalPayload,
      appliedProfiles,
      warnings
    }
  }

  private resolveProfiles(
    profileIds: string[],
    profiles: Profile[]
  ): Map<string, ProfileOverride> {
    const overrideMap = new Map<string, ProfileOverride>()
    for (const profileId of profileIds) {
      const profile = profiles.find((p) => p.id === profileId)
      if (!profile) continue
      for (const override of profile.overrides) {
        overrideMap.set(override.elementPath, override)
      }
    }
    return overrideMap
  }

  private generateElement(
    element: SchemaElement,
    path: string,
    adHocOverrides: Record<string, any>,
    profileOverrides: Map<string, ProfileOverride>,
    customTypes: CustomDataType[],
    warnings: ValidationWarning[]
  ): any {
    const profileOverride = profileOverrides.get(path)

    if (profileOverride?.action === 'omit') {
      return undefined
    }

    if (profileOverride?.action === 'nullify') {
      return null
    }

    const hasAdHocOverride = Object.prototype.hasOwnProperty.call(adHocOverrides, path)

    if (hasAdHocOverride) {
      return adHocOverrides[path]
    }

    if (profileOverride?.action === 'set') {
      return profileOverride.value
    }

    // Resolve effective type and strategy (custom type takes base, then profile 'generate' overrides strategy)
    let effectiveType: BuiltInType = element.dataType.type as BuiltInType
    let effectiveStrategy: GenerationStrategy = element.generationStrategy

    if (element.dataType.customTypeId) {
      const customType = customTypes.find((ct) => ct.id === element.dataType.customTypeId)
      if (customType) {
        effectiveType = customType.baseType
        effectiveStrategy = customType.defaultStrategy
      }
    }

    if (profileOverride?.action === 'generate' && profileOverride.generationStrategy) {
      effectiveStrategy = profileOverride.generationStrategy
    }

    if (effectiveType === 'object') {
      const obj: Record<string, any> = {}
      for (const child of element.children ?? []) {
        const childPath = `${path}.${child.name}`
        const result = this.generateElement(
          child,
          childPath,
          adHocOverrides,
          profileOverrides,
          customTypes,
          warnings
        )
        if (result !== undefined) {
          obj[child.name] = result
        }
      }
      return obj
    }

    if (effectiveType === 'array') {
      const count = Math.floor(Math.random() * 3) + 1
      const items: any[] = []
      for (let i = 0; i < count; i++) {
        const itemObj: Record<string, any> = {}
        for (const child of element.children ?? []) {
          const childPath = `${path}.${child.name}`
          const result = this.generateElement(
            child,
            childPath,
            adHocOverrides,
            profileOverrides,
            customTypes,
            warnings
          )
          if (result !== undefined) {
            itemObj[child.name] = result
          }
        }
        items.push(itemObj)
      }
      return items
    }

    return this.generateValue(effectiveStrategy, effectiveType)
  }

  private generateValue(strategy: GenerationStrategy, type: BuiltInType): any {
    switch (strategy.type) {
      case 'random':
        return this.generateRandom(type)
      case 'faker': {
        const config = strategy.config as FakerConfig
        return this.generateFaker(config)
      }
      case 'enum': {
        const config = strategy.config as EnumConfig
        if (!config.values || config.values.length === 0) return null
        return config.values[Math.floor(Math.random() * config.values.length)]
      }
      case 'pattern': {
        const config = strategy.config as PatternConfig
        return new RandExp(config.pattern).gen()
      }
      case 'range': {
        const config = strategy.config as RangeConfig
        return this.generateRange(config)
      }
      case 'constant': {
        const config = strategy.config as ConstantConfig
        return config.value
      }
      case 'template': {
        const config = strategy.config as TemplateConfig
        return config.template
      }
      default:
        return this.generateRandom(type)
    }
  }

  private generateRandom(type: BuiltInType): any {
    switch (type) {
      case 'string':
        return faker.string.alphanumeric(10)
      case 'integer':
        return faker.number.int({ min: 0, max: 1_000_000 })
      case 'number':
        return faker.number.float({ min: 0, max: 1_000_000 })
      case 'boolean':
        return faker.datatype.boolean()
      case 'null':
        return null
      default:
        return null
    }
  }

  private generateFaker(config: FakerConfig): any {
    try {
      const fakerInstance =
        config.locale && Object.prototype.hasOwnProperty.call(allFakers, config.locale)
          ? allFakers[config.locale as keyof typeof allFakers]
          : faker

      const parts = config.method.split('.')
      let obj: any = fakerInstance
      for (const part of parts) {
        if (obj === undefined || obj === null) {
          return faker.string.alphanumeric(10)
        }
        obj = obj[part]
      }

      if (typeof obj === 'function') {
        return obj()
      }
      return faker.string.alphanumeric(10)
    } catch {
      return faker.string.alphanumeric(10)
    }
  }

  private generateRange(config: RangeConfig): number {
    const { min, max, step, decimals } = config
    let value: number

    if (step !== undefined && step > 0) {
      const steps = Math.floor((max - min) / step)
      value = min + Math.floor(Math.random() * (steps + 1)) * step
    } else {
      value = min + Math.random() * (max - min)
    }

    if (decimals !== undefined) {
      return parseFloat(value.toFixed(decimals))
    }

    return value
  }

  validateEvent(
    payload: Record<string, any>,
    schema: Schema,
    customTypes: CustomDataType[] = []
  ): ValidationResult {
    const warnings: ValidationWarning[] = []
    this.validatePayload(payload, schema.elements, '', warnings, customTypes)
    return { valid: true, warnings }
  }

  private validatePayload(
    payload: Record<string, any>,
    elements: SchemaElement[],
    pathPrefix: string,
    warnings: ValidationWarning[],
    customTypes: CustomDataType[]
  ): void {
    for (const element of elements) {
      const path = pathPrefix ? `${pathPrefix}.${element.name}` : element.name

      if (!Object.prototype.hasOwnProperty.call(payload, element.name)) {
        if (element.required) {
          warnings.push({
            elementPath: path,
            message: `Required field '${path}' is missing from the generated payload`,
            severity: 'warning'
          })
        }
        continue
      }

      const value = payload[element.name]

      let effectiveType: BuiltInType = element.dataType.type as BuiltInType
      let effectiveConstraints = element.constraints

      if (element.dataType.customTypeId) {
        const customType = customTypes.find((ct) => ct.id === element.dataType.customTypeId)
        if (customType) {
          effectiveType = customType.baseType
          effectiveConstraints = effectiveConstraints ?? customType.constraints
        }
      }

      if (effectiveConstraints && value !== null && value !== undefined) {
        if (typeof value === 'string') {
          if (
            effectiveConstraints.minLength !== undefined &&
            value.length < effectiveConstraints.minLength
          ) {
            warnings.push({
              elementPath: path,
              message: `Value length ${value.length} is below minimum ${effectiveConstraints.minLength}`,
              severity: 'warning'
            })
          }
          if (
            effectiveConstraints.maxLength !== undefined &&
            value.length > effectiveConstraints.maxLength
          ) {
            warnings.push({
              elementPath: path,
              message: `Value length ${value.length} exceeds maximum ${effectiveConstraints.maxLength}`,
              severity: 'warning'
            })
          }
          if (effectiveConstraints.pattern) {
            const regex = new RegExp(effectiveConstraints.pattern)
            if (!regex.test(value as string)) {
              warnings.push({
                elementPath: path,
                message: `Value does not match required pattern '${effectiveConstraints.pattern}'`,
                severity: 'warning'
              })
            }
          }
        }

        if (
          effectiveConstraints.enum !== undefined &&
          !effectiveConstraints.enum.includes(value)
        ) {
          warnings.push({
            elementPath: path,
            message: `Value '${value}' is not in the allowed enum values`,
            severity: 'warning'
          })
        }
      }

      // Recurse for object types
      if (
        effectiveType === 'object' &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        element.children
      ) {
        this.validatePayload(value as Record<string, any>, element.children, path, warnings, customTypes)
      }

      // Recurse for array types
      if (effectiveType === 'array' && Array.isArray(value) && element.children) {
        for (const item of value) {
          if (item !== null && typeof item === 'object') {
            this.validatePayload(
              item as Record<string, any>,
              element.children,
              path,
              warnings,
              customTypes
            )
          }
        }
      }
    }
  }
}
