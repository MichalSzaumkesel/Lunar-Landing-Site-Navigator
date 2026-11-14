import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/components/common/FullscreenButton.css', 'utf8')
const simple = readFileSync('src/components/simple/simple.css', 'utf8')

describe('corner buttons', () => {
  it('share one rule and one size token', () => {
    expect(css).toMatch(/\.fs-button,\s*\.sky-help__marker\s*\{[^}]*var\(--corner-btn-size\)/)
    expect(css).toMatch(/--corner-btn-size:\s*28px/)
    expect(simple).not.toMatch(/\.sky-help__marker\s*\{[^}]*width:\s*20px/)
  })

  it('does not size the fullscreen target with 100vw', () => {
    expect(css).not.toMatch(/100vw/)
  })
})
