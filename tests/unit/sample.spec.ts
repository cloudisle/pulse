import { describe, it, expect } from 'vitest'

function add(a: number, b: number): number {
  return a + b
}

describe('sample unit tests', () => {
  it('adds two numbers correctly', () => {
    expect(add(1, 2)).toBe(3)
  })

  it('returns 0 when adding 0 and 0', () => {
    expect(add(0, 0)).toBe(0)
  })
})
