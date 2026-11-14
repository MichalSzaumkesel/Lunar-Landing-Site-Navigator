// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { DataBadges } from './DataBadges'

describe('DataBadges', () => {
  it('uses the site notes as the Approximate tooltip when present', () => {
    const html = renderToStaticMarkup(createElement(DataBadges, { approximate: true, notes: 'Position from a paper.' }))
    expect(html).toContain('title="Position from a paper."')
  })

  it('falls back to the generic tooltip without notes', () => {
    const html = renderToStaticMarkup(createElement(DataBadges, { approximate: true, notes: '' }))
    expect(html).toContain('known simplification')
  })
})
