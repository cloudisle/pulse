import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.stubGlobal('confirm', vi.fn(() => true))
})

