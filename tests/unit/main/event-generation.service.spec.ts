import { describe, it, expect, beforeEach } from 'vitest'
import { EventGenerationService } from '@main/services/event-generation.service'
import type { GenerateEventProps } from '@main/services/event-generation.service'
import type { Schema, SchemaElement, CustomDataType } from '@shared/models/schema'
import type { GenerateEventInput } from '@shared/models/event'
import type { Environment } from '@shared/models/environment'
import type { Profile } from '@shared/models/profile'
import type { GenerationStrategy } from '@shared/models/generation'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSchema(elements: SchemaElement[]): Schema {
  return {
    id: 'schema-1',
    systemId: 'sys-1',
    name: 'Test Schema',
    elements,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
}

function makeElement(
  name: string,
  overrides: Partial<SchemaElement> = {}
): SchemaElement {
  return {
    name,
    required: true,
    dataType: { type: 'string' },
    generationStrategy: { type: 'constant', config: { value: `default-${name}` } },
    ...overrides
  }
}

function makeInput(overrides: Partial<GenerateEventInput> = {}): GenerateEventInput {
  return { schemaId: 'schema-1', ...overrides }
}

function makeProps(overrides: Partial<GenerateEventProps> = {}): GenerateEventProps {
  return { ...overrides }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EventGenerationService', () => {
  let service: EventGenerationService

  beforeEach(() => {
    service = new EventGenerationService()
  })

  // ── Flat schema ────────────────────────────────────────────────────────────

  describe('flat schema generation', () => {
    it('generates a payload with all required fields present', async () => {
      const schema = makeSchema([
        makeElement('status', { generationStrategy: { type: 'constant', config: { value: 'active' } } }),
        makeElement('count', { dataType: { type: 'integer' }, generationStrategy: { type: 'constant', config: { value: 5 } } })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload).toHaveProperty('status', 'active')
      expect(result.payload).toHaveProperty('count', 5)
      expect(result.schemaId).toBe('schema-1')
      expect(result.warnings).toEqual([])
    })

    it('returns the schemaId and empty appliedProfiles when no profiles used', async () => {
      const schema = makeSchema([makeElement('name')])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.schemaId).toBe('schema-1')
      expect(result.appliedProfiles).toEqual([])
    })
  })

  // ── Strategy: constant ─────────────────────────────────────────────────────

  describe('strategy: constant', () => {
    it('returns config.value unchanged', async () => {
      const schema = makeSchema([
        makeElement('code', {
          generationStrategy: { type: 'constant', config: { value: 'XYZ-001' } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.code).toBe('XYZ-001')
    })

    it('returns null as the constant value', async () => {
      const schema = makeSchema([
        makeElement('nullable', {
          dataType: { type: 'null' },
          generationStrategy: { type: 'constant', config: { value: null } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.nullable).toBeNull()
    })
  })

  // ── Strategy: random ───────────────────────────────────────────────────────

  describe('strategy: random', () => {
    it('generates a string value for BuiltInType string', async () => {
      const schema = makeSchema([
        makeElement('id', {
          dataType: { type: 'string' },
          generationStrategy: { type: 'random', config: {} }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(typeof result.payload.id).toBe('string')
    })

    it('generates an integer value for BuiltInType integer', async () => {
      const schema = makeSchema([
        makeElement('qty', {
          dataType: { type: 'integer' },
          generationStrategy: { type: 'random', config: {} }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(Number.isInteger(result.payload.qty)).toBe(true)
    })

    it('generates a number value for BuiltInType number', async () => {
      const schema = makeSchema([
        makeElement('price', {
          dataType: { type: 'number' },
          generationStrategy: { type: 'random', config: {} }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(typeof result.payload.price).toBe('number')
    })

    it('generates a boolean value for BuiltInType boolean', async () => {
      const schema = makeSchema([
        makeElement('active', {
          dataType: { type: 'boolean' },
          generationStrategy: { type: 'random', config: {} }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(typeof result.payload.active).toBe('boolean')
    })

    it('returns null for BuiltInType null', async () => {
      const schema = makeSchema([
        makeElement('empty', {
          dataType: { type: 'null' },
          generationStrategy: { type: 'random', config: {} }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.empty).toBeNull()
    })
  })

  // ── Strategy: faker ────────────────────────────────────────────────────────

  describe('strategy: faker', () => {
    it('calls a faker method and returns a non-undefined value', async () => {
      const schema = makeSchema([
        makeElement('firstName', {
          dataType: { type: 'string' },
          generationStrategy: { type: 'faker', config: { method: 'person.firstName' } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(typeof result.payload.firstName).toBe('string')
      expect(result.payload.firstName.length).toBeGreaterThan(0)
    })

    it('falls back to alphanumeric when faker method is invalid', async () => {
      const schema = makeSchema([
        makeElement('x', {
          dataType: { type: 'string' },
          generationStrategy: { type: 'faker', config: { method: 'nonexistent.method' } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(typeof result.payload.x).toBe('string')
    })

    it('supports locale option', async () => {
      const schema = makeSchema([
        makeElement('name', {
          dataType: { type: 'string' },
          generationStrategy: { type: 'faker', config: { method: 'person.firstName', locale: 'de' } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(typeof result.payload.name).toBe('string')
    })
  })

  // ── Strategy: enum ─────────────────────────────────────────────────────────

  describe('strategy: enum', () => {
    it('selects a value from the provided list', async () => {
      const values = ['pending', 'active', 'closed']
      const schema = makeSchema([
        makeElement('status', {
          generationStrategy: { type: 'enum', config: { values } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(values).toContain(result.payload.status)
    })

    it('returns null when enum values list is empty', async () => {
      const schema = makeSchema([
        makeElement('status', {
          generationStrategy: { type: 'enum', config: { values: [] } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.status).toBeNull()
    })
  })

  // ── Strategy: pattern ──────────────────────────────────────────────────────

  describe('strategy: pattern', () => {
    it('generates a string matching the given pattern', async () => {
      const pattern = '[A-Z]{3}-\\d{4}'
      const schema = makeSchema([
        makeElement('code', {
          generationStrategy: { type: 'pattern', config: { pattern } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(typeof result.payload.code).toBe('string')
      expect(result.payload.code).toMatch(new RegExp(`^${pattern}$`))
    })
  })

  // ── Strategy: range ────────────────────────────────────────────────────────

  describe('strategy: range', () => {
    it('generates a number within [min, max]', async () => {
      const schema = makeSchema([
        makeElement('score', {
          dataType: { type: 'number' },
          generationStrategy: { type: 'range', config: { min: 10, max: 20 } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.score).toBeGreaterThanOrEqual(10)
      expect(result.payload.score).toBeLessThanOrEqual(20)
    })

    it('respects the decimals option', async () => {
      const schema = makeSchema([
        makeElement('ratio', {
          dataType: { type: 'number' },
          generationStrategy: { type: 'range', config: { min: 0, max: 1, decimals: 2 } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      const decimalPart = String(result.payload.ratio).split('.')[1] ?? ''
      expect(decimalPart.length).toBeLessThanOrEqual(2)
    })

    it('respects the step option', async () => {
      const schema = makeSchema([
        makeElement('multiple', {
          dataType: { type: 'integer' },
          generationStrategy: { type: 'range', config: { min: 0, max: 10, step: 5 } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect([0, 5, 10]).toContain(result.payload.multiple)
    })
  })

  // ── Strategy: template ─────────────────────────────────────────────────────

  describe('strategy: template', () => {
    it('returns the template string (variable replacement applied later)', async () => {
      const schema = makeSchema([
        makeElement('topic', {
          generationStrategy: { type: 'template', config: { template: '{{ env }}-orders' } }
        })
      ])
      const env: Environment = {
        id: 'env-1',
        systemId: 'sys-1',
        name: 'dev',
        variables: [{ key: 'env', value: 'dev', sensitive: false }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const result = await service.generateEvent(makeInput(), schema, makeProps({ environment: env }))
      expect(result.payload.topic).toBe('dev-orders')
    })

    it('leaves unresolved template variables unchanged when no environment', async () => {
      const schema = makeSchema([
        makeElement('topic', {
          generationStrategy: { type: 'template', config: { template: '{{ env }}-orders' } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.topic).toBe('{{ env }}-orders')
    })
  })

  // ── Profile: set ───────────────────────────────────────────────────────────

  describe('profile: set override', () => {
    it('replaces the generated value with the set value', async () => {
      const profile: Profile = {
        id: 'profile-1',
        systemId: 'sys-1',
        name: 'Override Profile',
        overrides: [{ elementPath: 'status', action: 'set', value: 'forced-value' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([makeElement('status')])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['profile-1'] }),
        schema,
        makeProps({ profiles: [profile] })
      )
      expect(result.payload.status).toBe('forced-value')
      expect(result.appliedProfiles).toContain('profile-1')
    })
  })

  // ── Profile: omit ──────────────────────────────────────────────────────────

  describe('profile: omit override', () => {
    it('removes the field from the payload', async () => {
      const profile: Profile = {
        id: 'profile-1',
        systemId: 'sys-1',
        name: 'Omit Profile',
        overrides: [{ elementPath: 'internal', action: 'omit' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([makeElement('name'), makeElement('internal')])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['profile-1'] }),
        schema,
        makeProps({ profiles: [profile] })
      )
      expect(result.payload).not.toHaveProperty('internal')
      expect(result.payload).toHaveProperty('name')
    })
  })

  // ── Profile: nullify ───────────────────────────────────────────────────────

  describe('profile: nullify override', () => {
    it('sets the field to null', async () => {
      const profile: Profile = {
        id: 'profile-1',
        systemId: 'sys-1',
        name: 'Nullify Profile',
        overrides: [{ elementPath: 'optional', action: 'nullify' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([makeElement('optional')])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['profile-1'] }),
        schema,
        makeProps({ profiles: [profile] })
      )
      expect(result.payload.optional).toBeNull()
    })
  })

  // ── Profile: generate ──────────────────────────────────────────────────────

  describe('profile: generate override', () => {
    it('swaps the generation strategy', async () => {
      const newStrategy: GenerationStrategy = {
        type: 'constant',
        config: { value: 'strategy-swapped' }
      }
      const profile: Profile = {
        id: 'profile-1',
        systemId: 'sys-1',
        name: 'Generate Profile',
        overrides: [{ elementPath: 'field', action: 'generate', generationStrategy: newStrategy }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([
        makeElement('field', {
          generationStrategy: { type: 'constant', config: { value: 'original' } }
        })
      ])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['profile-1'] }),
        schema,
        makeProps({ profiles: [profile] })
      )
      expect(result.payload.field).toBe('strategy-swapped')
    })
  })

  // ── Profile: last-write-wins ───────────────────────────────────────────────

  describe('profile: last-write-wins ordering', () => {
    it('applies profiles in order so the last profile wins', async () => {
      const profile1: Profile = {
        id: 'p1',
        systemId: 'sys-1',
        name: 'First',
        overrides: [{ elementPath: 'status', action: 'set', value: 'from-p1' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const profile2: Profile = {
        id: 'p2',
        systemId: 'sys-1',
        name: 'Second',
        overrides: [{ elementPath: 'status', action: 'set', value: 'from-p2' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([makeElement('status')])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['p1', 'p2'] }),
        schema,
        makeProps({ profiles: [profile1, profile2] })
      )
      expect(result.payload.status).toBe('from-p2')
    })

    it('first profile wins when only one profile is applied', async () => {
      const profile1: Profile = {
        id: 'p1',
        systemId: 'sys-1',
        name: 'First',
        overrides: [{ elementPath: 'status', action: 'set', value: 'from-p1' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const profile2: Profile = {
        id: 'p2',
        systemId: 'sys-1',
        name: 'Second',
        overrides: [{ elementPath: 'status', action: 'set', value: 'from-p2' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([makeElement('status')])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['p1'] }),
        schema,
        makeProps({ profiles: [profile1, profile2] })
      )
      expect(result.payload.status).toBe('from-p1')
    })
  })

  // ── Ad-hoc overrides ────────────────────────────────────────────────────────

  describe('ad-hoc overrides', () => {
    it('takes precedence over generated value', async () => {
      const schema = makeSchema([
        makeElement('name', {
          generationStrategy: { type: 'constant', config: { value: 'generated' } }
        })
      ])
      const result = await service.generateEvent(
        makeInput({ overrides: { name: 'adhoc-value' } }),
        schema,
        makeProps()
      )
      expect(result.payload.name).toBe('adhoc-value')
    })

    it('takes precedence over profile set override', async () => {
      const profile: Profile = {
        id: 'p1',
        systemId: 'sys-1',
        name: 'Profile',
        overrides: [{ elementPath: 'name', action: 'set', value: 'profile-value' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([makeElement('name')])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['p1'], overrides: { name: 'adhoc-value' } }),
        schema,
        makeProps({ profiles: [profile] })
      )
      expect(result.payload.name).toBe('adhoc-value')
    })

    it('forces optional field to be included', async () => {
      const schema = makeSchema([
        makeElement('optional', {
          required: false,
          generationStrategy: { type: 'constant', config: { value: 'value' } }
        })
      ])
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          service.generateEvent(
            makeInput({ overrides: { optional: 'forced' } }),
            schema,
            makeProps()
          )
        )
      )
      // Every result should have the optional field due to ad-hoc override
      expect(results.every((r) => r.payload.optional === 'forced')).toBe(true)
    })
  })

  // ── Optional elements ───────────────────────────────────────────────────────

  describe('optional elements', () => {
    it('includes required elements always', async () => {
      const schema = makeSchema([
        makeElement('required', { required: true, generationStrategy: { type: 'constant', config: { value: 'v' } } })
      ])
      const results = await Promise.all(
        Array.from({ length: 20 }, () => service.generateEvent(makeInput(), schema, makeProps()))
      )
      expect(results.every((r) => Object.prototype.hasOwnProperty.call(r.payload, 'required'))).toBe(true)
    })

    it('excludes optional elements when no override is applied', async () => {
      const schema = makeSchema([
        makeElement('opt', { required: false, generationStrategy: { type: 'constant', config: { value: 'v' } } })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload).not.toHaveProperty('opt')
    })

    it('profile require action forces optional element to be included', async () => {
      const profile: Profile = {
        id: 'p1',
        systemId: 'sys-1',
        name: 'Require Profile',
        overrides: [{ elementPath: 'opt', action: 'require' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([
        makeElement('opt', { required: false, generationStrategy: { type: 'constant', config: { value: 'v' } } })
      ])
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          service.generateEvent(
            makeInput({ profileIds: ['p1'] }),
            schema,
            makeProps({ profiles: [profile] })
          )
        )
      )
      expect(results.every((r) => Object.prototype.hasOwnProperty.call(r.payload, 'opt'))).toBe(true)
    })

    it('profile generate action forces optional element to be included with overridden strategy', async () => {
      const newStrategy: GenerationStrategy = {
        type: 'constant',
        config: { value: 'overridden' }
      }
      const profile: Profile = {
        id: 'p1',
        systemId: 'sys-1',
        name: 'Generate Profile',
        overrides: [{ elementPath: 'opt', action: 'generate', generationStrategy: newStrategy }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([
        makeElement('opt', { required: false, generationStrategy: { type: 'constant', config: { value: 'original' } } })
      ])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['p1'] }),
        schema,
        makeProps({ profiles: [profile] })
      )
      expect(result.payload.opt).toBe('overridden')
    })
  })

  // ── Nested objects ─────────────────────────────────────────────────────────

  describe('nested objects', () => {
    it('recursively generates child fields', async () => {
      const schema = makeSchema([
        makeElement('address', {
          dataType: { type: 'object' },
          generationStrategy: { type: 'random', config: {} },
          children: [
            makeElement('city', {
              generationStrategy: { type: 'constant', config: { value: 'Berlin' } }
            }),
            makeElement('zip', {
              generationStrategy: { type: 'constant', config: { value: '10001' } }
            })
          ]
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.address).toEqual({ city: 'Berlin', zip: '10001' })
    })

    it('applies profile overrides to nested elements using dot-notation path', async () => {
      const profile: Profile = {
        id: 'p1',
        systemId: 'sys-1',
        name: 'Nested Override',
        overrides: [{ elementPath: 'address.city', action: 'set', value: 'Paris' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([
        makeElement('address', {
          dataType: { type: 'object' },
          generationStrategy: { type: 'random', config: {} },
          children: [
            makeElement('city', {
              generationStrategy: { type: 'constant', config: { value: 'Berlin' } }
            })
          ]
        })
      ])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['p1'] }),
        schema,
        makeProps({ profiles: [profile] })
      )
      expect(result.payload.address.city).toBe('Paris')
    })

    it('applies ad-hoc overrides to nested elements using dot-notation path', async () => {
      const schema = makeSchema([
        makeElement('address', {
          dataType: { type: 'object' },
          generationStrategy: { type: 'random', config: {} },
          children: [
            makeElement('city', {
              generationStrategy: { type: 'constant', config: { value: 'Berlin' } }
            })
          ]
        })
      ])
      const result = await service.generateEvent(
        makeInput({ overrides: { 'address.city': 'Tokyo' } }),
        schema,
        makeProps()
      )
      expect(result.payload.address.city).toBe('Tokyo')
    })
  })

  // ── Arrays ─────────────────────────────────────────────────────────────────

  describe('array types', () => {
    it('generates between 1 and 3 items', async () => {
      const schema = makeSchema([
        makeElement('items', {
          dataType: { type: 'array' },
          generationStrategy: { type: 'random', config: {} },
          children: [
            makeElement('id', {
              generationStrategy: { type: 'constant', config: { value: 'item-id' } }
            })
          ]
        })
      ])
      // Run multiple times to observe the range
      const counts = new Set<number>()
      for (let i = 0; i < 50; i++) {
        const result = await service.generateEvent(makeInput(), schema, makeProps())
        const arr = result.payload.items as any[]
        expect(arr.length).toBeGreaterThanOrEqual(1)
        expect(arr.length).toBeLessThanOrEqual(3)
        counts.add(arr.length)
      }
      // Over 50 iterations at least two different counts should appear
      expect(counts.size).toBeGreaterThan(1)
    })

    it('generates each array item with child field values', async () => {
      const schema = makeSchema([
        makeElement('tags', {
          dataType: { type: 'array' },
          generationStrategy: { type: 'random', config: {} },
          children: [
            makeElement('label', {
              generationStrategy: { type: 'constant', config: { value: 'fixed-label' } }
            })
          ]
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      const tags = result.payload.tags as any[]
      expect(tags.length).toBeGreaterThan(0)
      for (const tag of tags) {
        expect(tag).toHaveProperty('label', 'fixed-label')
      }
    })
  })

  // ── Variable replacement ───────────────────────────────────────────────────

  describe('variable replacement', () => {
    it('replaces {{ key }} placeholders using environment variables', async () => {
      const env: Environment = {
        id: 'env-1',
        systemId: 'sys-1',
        name: 'dev',
        variables: [{ key: 'region', value: 'us-east-1', sensitive: false }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([
        makeElement('stream', {
          generationStrategy: { type: 'constant', config: { value: 'orders-{{ region }}' } }
        })
      ])
      const result = await service.generateEvent(
        makeInput({ environmentId: 'env-1' }),
        schema,
        makeProps({ environment: env })
      )
      expect(result.payload.stream).toBe('orders-us-east-1')
    })

    it('leaves placeholders unchanged when no environment is provided', async () => {
      const schema = makeSchema([
        makeElement('stream', {
          generationStrategy: { type: 'constant', config: { value: '{{ env }}-stream' } }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.stream).toBe('{{ env }}-stream')
    })

    it('applies variable replacement in nested objects', async () => {
      const env: Environment = {
        id: 'env-1',
        systemId: 'sys-1',
        name: 'dev',
        variables: [{ key: 'env', value: 'production', sensitive: false }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([
        makeElement('meta', {
          dataType: { type: 'object' },
          generationStrategy: { type: 'random', config: {} },
          children: [
            makeElement('topic', {
              generationStrategy: { type: 'constant', config: { value: '{{ env }}-topic' } }
            })
          ]
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps({ environment: env }))
      expect(result.payload.meta.topic).toBe('production-topic')
    })
  })

  // ── Validation warnings ────────────────────────────────────────────────────

  describe('validation warnings', () => {
    it('collects a warning when a string value is shorter than minLength', async () => {
      const schema = makeSchema([
        makeElement('code', {
          generationStrategy: { type: 'constant', config: { value: 'AB' } },
          constraints: { minLength: 5 }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.warnings.some((w) => w.elementPath === 'code')).toBe(true)
      expect(result.warnings[0].severity).toBe('warning')
    })

    it('collects a warning when a string value exceeds maxLength', async () => {
      const schema = makeSchema([
        makeElement('code', {
          generationStrategy: { type: 'constant', config: { value: 'TOOLONG' } },
          constraints: { maxLength: 3 }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.warnings.some((w) => w.elementPath === 'code')).toBe(true)
    })

    it('collects a warning when a value does not match the constraint pattern', async () => {
      const schema = makeSchema([
        makeElement('ref', {
          generationStrategy: { type: 'constant', config: { value: 'abc123' } },
          constraints: { pattern: '^[A-Z]+-\\d+$' }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.warnings.some((w) => w.elementPath === 'ref')).toBe(true)
    })

    it('collects a warning when a value is not in the constraint enum', async () => {
      const schema = makeSchema([
        makeElement('status', {
          generationStrategy: { type: 'constant', config: { value: 'unknown' } },
          constraints: { enum: ['active', 'inactive'] }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.warnings.some((w) => w.elementPath === 'status')).toBe(true)
    })

    it('does not reject the payload when there are validation warnings', async () => {
      const schema = makeSchema([
        makeElement('id', {
          generationStrategy: { type: 'constant', config: { value: 'x' } },
          constraints: { minLength: 100 }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.payload.id).toBe('x')
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('generates no warnings for valid payloads', async () => {
      const schema = makeSchema([
        makeElement('code', {
          generationStrategy: { type: 'constant', config: { value: 'ABC' } },
          constraints: { minLength: 1, maxLength: 10 }
        })
      ])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.warnings).toEqual([])
    })
  })

  // ── Custom data types ──────────────────────────────────────────────────────

  describe('custom data types', () => {
    it('resolves to the base type and uses the default strategy', async () => {
      const customType: CustomDataType = {
        id: 'ct-1',
        systemId: 'sys-1',
        name: 'PhoneNumber',
        baseType: 'string',
        defaultStrategy: { type: 'constant', config: { value: '+1-555-0100' } }
      }
      const schema = makeSchema([
        makeElement('phone', {
          dataType: { type: 'string', customTypeId: 'ct-1' },
          generationStrategy: { type: 'random', config: {} } // overridden by custom type
        })
      ])
      const result = await service.generateEvent(
        makeInput(),
        schema,
        makeProps({ customTypes: [customType] })
      )
      expect(result.payload.phone).toBe('+1-555-0100')
    })

    it('validates using the custom type constraints when element has none', async () => {
      const customType: CustomDataType = {
        id: 'ct-1',
        systemId: 'sys-1',
        name: 'ShortCode',
        baseType: 'string',
        defaultStrategy: { type: 'constant', config: { value: 'TOOLONGVALUE' } },
        constraints: { maxLength: 4 }
      }
      const schema = makeSchema([
        makeElement('code', {
          dataType: { type: 'string', customTypeId: 'ct-1' },
          generationStrategy: { type: 'random', config: {} }
        })
      ])
      const result = await service.generateEvent(
        makeInput(),
        schema,
        makeProps({ customTypes: [customType] })
      )
      expect(result.warnings.some((w) => w.elementPath === 'code')).toBe(true)
    })
  })

  // ── appliedProfiles ────────────────────────────────────────────────────────

  describe('appliedProfiles', () => {
    it('lists only the profile IDs that exist in props.profiles', async () => {
      const profile: Profile = {
        id: 'p1',
        systemId: 'sys-1',
        name: 'P1',
        overrides: [],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      }
      const schema = makeSchema([makeElement('f')])
      const result = await service.generateEvent(
        makeInput({ profileIds: ['p1', 'p-missing'] }),
        schema,
        makeProps({ profiles: [profile] })
      )
      // p1 is in profiles so it's applied; p-missing is not so it's still listed
      expect(result.appliedProfiles).toContain('p1')
    })

    it('returns empty appliedProfiles when no profileIds provided', async () => {
      const schema = makeSchema([makeElement('f')])
      const result = await service.generateEvent(makeInput(), schema, makeProps())
      expect(result.appliedProfiles).toEqual([])
    })
  })
})
