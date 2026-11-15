import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/components/common/FullscreenButton.css', 'utf8')
const simple = readFileSync('src/components/simple/simple.css', 'utf8')

describe('corner buttons', () => {
  it('share one rule and one size token', () => {
    expect(css).toMatch(/\.fs-button,\s*\.sky-help__marker\s*\{[^}]*var\(--corner-btn-size\)/)
    expect(css).toMatch(/--corner-btn-size:\s*32px/)
    expect(simple).not.toMatch(/\.sky-help__marker\s*\{[^}]*width:\s*20px/)
  })

  it('3D badges sit left of the corner button and the map loading uses an SVG ring overlay', () => {
    const surface = readFileSync('src/viz3d/surface.css', 'utf8')
    expect(surface).toMatch(/\.surface__badges\s*\{[^}]*right:\s*calc\(var\(--corner-btn-size/)
    expect(surface).toMatch(/\.surface__mapbtn-ring\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/)
    expect(surface).not.toMatch(/offset-path/)
    expect(surface).toMatch(/prefers-reduced-motion[\s\S]*\.surface__mapbtn\[data-loading\]/)
  })

  it('does not size the fullscreen target with 100vw', () => {
    expect(css).not.toMatch(/100vw/)
  })
})
