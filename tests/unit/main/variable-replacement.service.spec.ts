import { describe, it, expect, beforeEach } from 'vitest'
import { VariableReplacementService } from '@main/services/variable-replacement.service'

describe('VariableReplacementService', () => {
  let service: VariableReplacementService

  beforeEach(() => {
    service = new VariableReplacementService()
  })

  describe('replaceVariables', () => {
    it('replaces a single {{ key }} placeholder with the corresponding value', () => {
      expect(service.replaceVariables('{{ env }}-stream', { env: 'dev' })).toBe('dev-stream')
    })

    it('replaces {{key}} without spaces', () => {
      expect(service.replaceVariables('{{env}}-stream', { env: 'dev' })).toBe('dev-stream')
    })

    it('replaces multiple placeholders in the same string', () => {
      expect(
        service.replaceVariables('{{ env }}-{{ region }}-stream', { env: 'dev', region: 'us-east-1' })
      ).toBe('dev-us-east-1-stream')
    })

    it('leaves the placeholder unchanged when the key is not in the variables map', () => {
      expect(service.replaceVariables('{{ missing }}-stream', {})).toBe('{{ missing }}-stream')
    })

    it('returns the original string unchanged when there are no placeholders', () => {
      expect(service.replaceVariables('plain-string', { env: 'dev' })).toBe('plain-string')
    })

    it('replaces the same placeholder appearing multiple times', () => {
      expect(service.replaceVariables('{{ env }}-{{ env }}', { env: 'prod' })).toBe('prod-prod')
    })

    it('trims internal whitespace variations consistently', () => {
      expect(service.replaceVariables('{{  env  }}', { env: 'staging' })).toBe('staging')
    })
  })

  describe('replaceVariablesInObject', () => {
    it('replaces string values in a flat object', () => {
      const result = service.replaceVariablesInObject(
        { streamName: '{{ env }}-orders', region: '{{ region }}' },
        { env: 'dev', region: 'us-east-1' }
      )
      expect(result).toEqual({ streamName: 'dev-orders', region: 'us-east-1' })
    })

    it('replaces string values nested in a deep object', () => {
      const obj = { outer: { inner: '{{ env }}-queue' } }
      const result = service.replaceVariablesInObject(obj, { env: 'prod' })
      expect(result).toEqual({ outer: { inner: 'prod-queue' } })
    })

    it('replaces string values inside arrays', () => {
      const obj = { topics: ['{{ env }}-topic-a', '{{ env }}-topic-b'] }
      const result = service.replaceVariablesInObject(obj, { env: 'dev' })
      expect(result).toEqual({ topics: ['dev-topic-a', 'dev-topic-b'] })
    })

    it('does not mutate the original object', () => {
      const original = { name: '{{ env }}-stream' }
      service.replaceVariablesInObject(original, { env: 'dev' })
      expect(original.name).toBe('{{ env }}-stream')
    })

    it('preserves non-string values unchanged', () => {
      const obj = { count: 42, active: true, name: '{{ env }}' }
      const result = service.replaceVariablesInObject(obj, { env: 'dev' })
      expect(result).toEqual({ count: 42, active: true, name: 'dev' })
    })

    it('leaves unresolved placeholders in object values unchanged', () => {
      const result = service.replaceVariablesInObject({ key: '{{ missing }}' }, {})
      expect(result).toEqual({ key: '{{ missing }}' })
    })
  })

  describe('findUnresolvedVariables', () => {
    it('returns an empty array when all variables are resolved', () => {
      expect(service.findUnresolvedVariables('{{ env }}-stream', { env: 'dev' })).toEqual([])
    })

    it('returns a list of variable names that are missing from the map', () => {
      const result = service.findUnresolvedVariables('{{ env }}-{{ region }}', { env: 'dev' })
      expect(result).toEqual(['region'])
    })

    it('returns an empty array when the string contains no placeholders', () => {
      expect(service.findUnresolvedVariables('plain-string', {})).toEqual([])
    })

    it('does not duplicate variable names when the same placeholder appears multiple times', () => {
      const result = service.findUnresolvedVariables('{{ env }}-{{ env }}', {})
      expect(result).toEqual(['env'])
    })

    it('returns all unresolved variable names from a multi-variable string', () => {
      const result = service.findUnresolvedVariables('{{ a }}-{{ b }}-{{ c }}', { b: 'val' })
      expect(result).toEqual(['a', 'c'])
    })
  })
})
