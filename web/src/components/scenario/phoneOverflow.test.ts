import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/components/scenario/scenario.css', 'utf8')

/** Body of the first rule whose selector list is exactly `selector`, optionally inside the last 520px media block. */
function rule(selector: string, source = css): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source)
  return m?.[1] ?? ''
}

describe('phone width overflow guard', () => {
  it('lets a long site name shrink the select instead of widening the card', () => {
    const select = rule('.site-select select')
    expect(select).toMatch(/min-width:\s*0/)
    expect(select).toMatch(/max-width:\s*100%/)
    expect(select).toMatch(/text-overflow:\s*ellipsis/)
    expect(rule('.site-select')).toMatch(/min-width:\s*0/)
    expect(rule('.card__heading')).toMatch(/min-width:\s*0/)
  })

  it('stretches the stacked card header so its children are bounded by the card', () => {
    const phone = css.slice(css.indexOf('@media (max-width: 520px)'))
    expect(rule('.card__header', phone)).toMatch(/flex-direction:\s*column/)
    expect(rule('.card__header', phone)).toMatch(/align-items:\s*stretch/)
  })
})
