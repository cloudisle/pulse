import { describe, it, expect, beforeEach } from 'vitest'
import { OpenApiImportService } from '@main/services/openapi-import.service'

describe('OpenApiImportService', () => {
  let service: OpenApiImportService

  beforeEach(() => {
    service = new OpenApiImportService()
  })

  it('parses a valid OpenAPI 3.x JSON with string/integer properties', () => {
    const doc = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'integer', description: 'User ID' },
              name: { type: 'string', description: 'User name' },
              email: { type: 'string' }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    expect(result.error).toBeUndefined()
    expect(result.schemas).toHaveLength(1)
    const schema = result.schemas[0]
    expect(schema.name).toBe('User')
    expect(schema.elements).toHaveLength(3)

    const id = schema.elements.find((e) => e.name === 'id')!
    expect(id.dataType.type).toBe('integer')
    expect(id.required).toBe(true)
    expect(id.description).toBe('User ID')

    const name = schema.elements.find((e) => e.name === 'name')!
    expect(name.dataType.type).toBe('string')
    expect(name.required).toBe(true)

    const email = schema.elements.find((e) => e.name === 'email')!
    expect(email.dataType.type).toBe('string')
    expect(email.required).toBe(false)
  })

  it('parses a schema with a nested object property', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Order: {
            type: 'object',
            properties: {
              address: {
                type: 'object',
                properties: {
                  street: { type: 'string' },
                  city: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    expect(result.error).toBeUndefined()
    const schema = result.schemas[0]
    const address = schema.elements.find((e) => e.name === 'address')!
    expect(address.dataType.type).toBe('object')
    expect(address.children).toHaveLength(2)
    expect(address.children![0].name).toBe('street')
    expect(address.children![1].name).toBe('city')
  })

  it('parses a schema property with enum', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Status: {
            type: 'object',
            properties: {
              state: { type: 'string', enum: ['active', 'inactive', 'pending'] }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    expect(result.error).toBeUndefined()
    const el = result.schemas[0].elements[0]
    expect(el.constraints?.enum).toEqual(['active', 'inactive', 'pending'])
    expect(el.generationStrategy.type).toBe('enum')
    const config = el.generationStrategy.config as { values: any[] }
    expect(config.values).toEqual(['active', 'inactive', 'pending'])
  })

  it('parses a schema property with pattern (no enum)', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Code: {
            type: 'object',
            properties: {
              code: { type: 'string', pattern: '^[A-Z]{3}-\\d{4}$' }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    expect(result.error).toBeUndefined()
    const el = result.schemas[0].elements[0]
    expect(el.constraints?.pattern).toBe('^[A-Z]{3}-\\d{4}$')
    expect(el.generationStrategy.type).toBe('pattern')
    const config = el.generationStrategy.config as { pattern: string }
    expect(config.pattern).toBe('^[A-Z]{3}-\\d{4}$')
  })

  it('parses a schema property with minimum and maximum', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Score: {
            type: 'object',
            properties: {
              value: { type: 'integer', minimum: 0, maximum: 100 }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    expect(result.error).toBeUndefined()
    const el = result.schemas[0].elements[0]
    expect(el.generationStrategy.type).toBe('range')
    const config = el.generationStrategy.config as { min: number; max: number }
    expect(config.min).toBe(0)
    expect(config.max).toBe(100)
  })

  it('parses a valid YAML string', () => {
    const yamlContent = `
openapi: "3.0.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Product:
      type: object
      properties:
        id:
          type: string
        price:
          type: number
`
    const result = service.parse(yamlContent)
    expect(result.error).toBeUndefined()
    expect(result.schemas).toHaveLength(1)
    expect(result.schemas[0].name).toBe('Product')
    expect(result.schemas[0].elements).toHaveLength(2)
  })

  it('returns error for completely invalid string', () => {
    const result = service.parse('this is not json or yaml: :::{{{{')
    expect(result.error).toBeTruthy()
    expect(result.schemas).toHaveLength(0)
  })

  it('returns empty schemas for valid JSON without components.schemas', () => {
    const doc = { openapi: '3.0.0', info: { title: 'Empty', version: '1' }, paths: {} }
    const result = service.parse(JSON.stringify(doc))
    expect(result.error).toBeUndefined()
    expect(result.schemas).toEqual([])
  })

  it('returns error for Swagger 2.0 document', () => {
    const doc = { swagger: '2.0', info: { title: 'Old', version: '1' } }
    const result = service.parse(JSON.stringify(doc))
    expect(result.error).toBeTruthy()
  })

  it('sets constraints to empty object when no constraints apply', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Simple: {
            type: 'object',
            properties: {
              name: { type: 'string' }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    const el = result.schemas[0].elements[0]
    expect(el.constraints).toBeDefined()
    expect(el.constraints).toEqual({})
  })

  it('always sets generationStrategy on every element', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          Mixed: {
            type: 'object',
            properties: {
              a: { type: 'string' },
              b: { type: 'integer' },
              c: { type: 'boolean' }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    for (const el of result.schemas[0].elements) {
      expect(el.generationStrategy).toBeDefined()
      expect(el.generationStrategy.type).toBeTruthy()
    }
  })

  it('maps array type with items as single child named item', () => {
    const doc = {
      openapi: '3.0.0',
      components: {
        schemas: {
          List: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    }
    const result = service.parse(JSON.stringify(doc))
    const tags = result.schemas[0].elements[0]
    expect(tags.dataType.type).toBe('array')
    expect(tags.children).toHaveLength(1)
    expect(tags.children![0].name).toBe('item')
    expect(tags.children![0].dataType.type).toBe('string')
  })
})
