import { describe, expect, it } from 'vitest'
import { horizonsQueryText } from './horizonsQuery.ts'

describe('horizonsQueryText', () => {
  it('serialises the recorded record verbatim, with no key added or changed', () => {
    const q = { CENTER: "'coord@301'", SITE_COORD: "'23.473100,0.674200,-1.928000'", STEP_SIZE: "'1h'" }
    const text = horizonsQueryText({ horizons_query: q })!
    expect(JSON.parse(text)).toEqual(q)
    expect(text).toContain("'23.473100,0.674200,-1.928000'")
  })

  it('is null when absent, empty or no ephemeris', () => {
    expect(horizonsQueryText({})).toBeNull()
    expect(horizonsQueryText({ horizons_query: {} })).toBeNull()
    expect(horizonsQueryText(null)).toBeNull()
    expect(horizonsQueryText(undefined)).toBeNull()
  })
})
