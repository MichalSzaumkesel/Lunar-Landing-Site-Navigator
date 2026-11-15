// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Static guard for the shared motion rules: one token set, nothing slow, only compositor-friendly
// properties, and a reduced-motion path for every CSS and JS animation.

const SRC = join(__dirname, '..')
const MAX_MS = 350

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = walk(SRC)
const cssFiles = files.filter((f) => f.endsWith('.css'))
const rel = (f: string) => relative(SRC, f).split('\\').join('/')
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const theme = strip(readFileSync(join(SRC, 'app/theme.css'), 'utf8'))

interface Decl {
  file: string
  prop: string
  value: string
}

function declarations(): Decl[] {
  const out: Decl[] = []
  for (const f of cssFiles) {
    const css = strip(readFileSync(f, 'utf8'))
    for (const m of css.matchAll(/(?:^|[\s;{])(animation|transition)(-duration)?\s*:\s*([^;}]+)/g)) {
      out.push({ file: rel(f), prop: m[1] + (m[2] ?? ''), value: m[3].trim() })
    }
  }
  return out
}

const decls = declarations()

describe('motion guard', () => {
  it('finds the CSS to check', () => {
    expect(cssFiles.length).toBeGreaterThan(10)
    expect(decls.length).toBeGreaterThan(40)
  })

  it('theme.css neutralises every animation and transition for prefers-reduced-motion', () => {
    const m = theme.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{([^}]*)\}/)
    expect(m, 'global reduced-motion rule').not.toBeNull()
    expect(m![1]).toMatch(/animation-duration:\s*0\.01ms !important/)
    expect(m![1]).toMatch(/transition-duration:\s*0\.01ms !important/)
    expect(m![1]).toMatch(/animation-delay:\s*0s !important/)
    expect(m![1]).toMatch(/transition-delay:\s*0s !important/)
  })

  it('no !important duration outside the reduced-motion rule could defeat it', () => {
    for (const d of decls) {
      if (d.file === 'app/theme.css' && /0\.01ms/.test(d.value)) continue
      if (/-duration/.test(d.prop)) expect(d.value, `${d.file} ${d.prop}`).not.toMatch(/!important/)
    }
  })

  it('every finite animation and transition is at most 350 ms', () => {
    for (const d of decls) {
      if (/infinite/.test(d.value) || d.value === 'none') continue
      for (const t of d.value.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) {
        const ms = Number(t[1]) * (t[2] === 's' ? 1000 : 1)
        expect(ms, `${d.file}: ${d.prop}: ${d.value}`).toBeLessThanOrEqual(MAX_MS)
      }
    }
  })

  it('only the shared motion tokens are used, and they are all defined', () => {
    const defined = new Set([...theme.matchAll(/(--motion-[\w-]+)\s*:/g)].map((m) => m[1]))
    expect(defined.size).toBeGreaterThanOrEqual(7)
    for (const f of cssFiles) {
      const css = strip(readFileSync(f, 'utf8'))
      for (const m of css.matchAll(/var\((--motion-[\w-]+)/g)) {
        expect(defined.has(m[1]), `${rel(f)} uses undefined ${m[1]}`).toBe(true)
      }
    }
  })

  it('transitions do not animate layout properties', () => {
    // Older cases that predate this guard; new code must use transform or opacity.
    const legacy = new Set(['viz3d/surface.css:flex-grow', 'components/library/library.css:block-size'])
    const layout =
      /^(width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*|flex-grow|flex-basis|block-size|inline-size|max-height|min-height)$/
    for (const d of decls) {
      if (d.prop !== 'transition') continue
      for (const part of d.value.split(/,(?![^(]*\))/)) {
        const property = part.trim().split(/\s+/)[0]
        if (layout.test(property) && !legacy.has(`${d.file}:${property}`)) {
          throw new Error(`${d.file}: transition on ${property}`)
        }
      }
    }
  })

  it('keyframes never animate layout properties', () => {
    // grid-template-rows 0fr to 1fr is the one allowed height reveal (presence-collapse)
    const layout = /\b(width|height|top|left|right|bottom|margin(-[a-z]+)?|padding(-[a-z]+)?)\s*:/
    for (const f of cssFiles) {
      if (rel(f).startsWith('components/map/') || rel(f).startsWith('components/print/')) continue
      const css = strip(readFileSync(f, 'utf8'))
      for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)) {
        expect(m[2], `${rel(f)} @keyframes ${m[1]}`).not.toMatch(layout)
      }
    }
  })

  it('every Web Animations call checks prefers-reduced-motion', () => {
    const tsFiles = files.filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f) && !rel(f).startsWith('viz3d/'))
    for (const f of tsFiles) {
      const text = readFileSync(f, 'utf8')
      if (/\.animate\(/.test(text)) {
        expect(text, `${rel(f)} calls .animate(`).toMatch(/prefersReducedMotion|prefers-reduced-motion/)
      }
    }
  })
})
