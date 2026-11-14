import { describe, expect, it } from 'vitest'
import { summariseValidation } from './validationSummary'

describe('summariseValidation', () => {
  it('counts and groups checks by kind', () => {
    const s = summariseValidation({
      checks: [
        { id: 'a', kind: 'ephemeris', pass: true },
        { id: 'b', kind: 'ephemeris', pass: false },
        { id: 'c', kind: 'orientation', pass: true, site_id: 'x' },
      ],
    })
    expect(s?.total).toBe(3)
    expect(s?.passed).toBe(2)
    expect(s?.groups.map((g) => [g.kind, g.passed, g.checks.length])).toEqual([
      ['ephemeris', 1, 2],
      ['orientation', 1, 1],
    ])
  })

  it('skips malformed rows and rejects files without checks', () => {
    expect(summariseValidation({ checks: [{ id: 1 }, null] })).toBeNull()
    expect(summariseValidation({})).toBeNull()
    expect(summariseValidation(null)).toBeNull()
  })
})
