import * as yaml from 'js-yaml'
import type { SchemaElement, SchemaConstraints } from '../../shared/models/schema'
import type { GenerationStrategy } from '../../shared/models/generation'

export interface OpenApiParsedSchema {
  name: string
  description?: string
  elements: SchemaElement[]
}

export interface OpenApiImportResult {
  schemas: OpenApiParsedSchema[]
  error?: string
}

export class OpenApiImportService {
  parse(content: string): OpenApiImportResult {
    let doc: unknown

    try {
      doc = JSON.parse(content)
    } catch {
      try {
        doc = yaml.load(content)
      } catch {
        return { schemas: [], error: 'Could not parse content as JSON or YAML.' }
      }
    }

    if (!doc || typeof doc !== 'object') {
      return { schemas: [], error: 'Parsed content is not a valid object.' }
    }

    const root = doc as Record<string, unknown>

    if (typeof root.openapi !== 'string' || !root.openapi.startsWith('3.')) {
      return { schemas: [], error: 'Only OpenAPI 3.x documents are supported.' }
    }

    const components = root.components as Record<string, unknown> | undefined
    const schemasMap = components?.schemas as Record<string, unknown> | undefined

    if (!schemasMap || typeof schemasMap !== 'object' || Object.keys(schemasMap).length === 0) {
      return { schemas: [] }
    }

    const schemas: OpenApiParsedSchema[] = Object.entries(schemasMap).map(([name, schemaDef]) => {
      const def = (schemaDef ?? {}) as Record<string, unknown>
      const description = typeof def.description === 'string' ? def.description : undefined
      const elements = this.convertProperties(def)
      return { name, description, elements }
    })

    return { schemas }
  }

  private convertProperties(schemaDef: Record<string, unknown>): SchemaElement[] {
    const properties = schemaDef.properties as Record<string, unknown> | undefined
    if (!properties || typeof properties !== 'object') {
      return []
    }

    const required = Array.isArray(schemaDef.required)
      ? (schemaDef.required as string[])
      : []

    return Object.entries(properties).map(([key, propDef]) => {
      return this.convertProperty(key, (propDef ?? {}) as Record<string, unknown>, required)
    })
  }

  private convertProperty(
    key: string,
    prop: Record<string, unknown>,
    required: string[]
  ): SchemaElement {
    const description = typeof prop.description === 'string' ? prop.description : undefined
    const isRequired = required.includes(key)
    const type = typeof prop.type === 'string' ? prop.type : 'string'

    const constraints: SchemaConstraints = {}
    let generationStrategy: GenerationStrategy

    // Build constraints
    if (typeof prop.minLength === 'number') constraints.minLength = prop.minLength
    if (typeof prop.maxLength === 'number') constraints.maxLength = prop.maxLength
    if (typeof prop.format === 'string') constraints.format = prop.format

    // Determine generation strategy (priority: enum > pattern > range > random)
    if (Array.isArray(prop.enum)) {
      constraints.enum = prop.enum
      generationStrategy = { type: 'enum', config: { values: prop.enum } }
    } else if (typeof prop.pattern === 'string') {
      constraints.pattern = prop.pattern
      generationStrategy = { type: 'pattern', config: { pattern: prop.pattern } }
    } else if (typeof prop.minimum === 'number' || typeof prop.maximum === 'number') {
      const min = typeof prop.minimum === 'number' ? prop.minimum : 0
      const max = typeof prop.maximum === 'number' ? prop.maximum : 100
      generationStrategy = { type: 'range', config: { min, max, step: 1, decimals: 0 } }
    } else {
      generationStrategy = { type: 'random', config: {} }
    }

    const element: SchemaElement = {
      name: key,
      description,
      required: isRequired,
      dataType: { type: type as any },
      generationStrategy,
      constraints
    }

    // Handle nested types
    if (type === 'object') {
      element.children = this.convertProperties(prop)
    } else if (type === 'array' && prop.items && typeof prop.items === 'object') {
      const items = prop.items as Record<string, unknown>
      element.children = [this.convertProperty('item', items, [])]
    }

    return element
  }
}
