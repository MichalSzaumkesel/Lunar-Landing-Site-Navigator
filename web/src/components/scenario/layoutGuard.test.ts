import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(`src/${p}`, 'utf8')
const scenario = read('components/scenario/scenario.css')
const timeline = read('components/timeline/timeline.css')
const theme = read('app/theme.css')
const demo = read('components/demo/demo.css')
const compare = read('components/compare/compare.css')

describe('layout guards (wave 74)', () => {
  it('keeps a countdown range in one piece', () => {
    expect(scenario).toMatch(/\.countdown__range\s*\{[^}]*white-space:\s*nowrap/)
  })

  it('wraps the timeline toolbar instead of scrolling it sideways', () => {
    expect(timeline).toMatch(/\.tl__toolbar\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(timeline).not.toMatch(/\.tl__toolbar\s*\{[^}]*overflow-x:\s*auto/)
  })

  it('uses a two-row grid transport on phones with the readout on row 1', () => {
    const phone = theme.slice(theme.indexOf('Phone: two tight rows'))
    expect(phone).toMatch(/\.transport\s*\{[^}]*display:\s*grid/)
    expect(phone).toMatch(/\.transport \.readout\s*\{[^}]*grid-row:\s*1/)
  })

  it('reserves three caption lines for the demo bar on phones', () => {
    expect(demo).toMatch(/min-height:\s*calc\(3 \* 1\.35em\)/)
  })

  it('uses a fixed compare table layout', () => {
    expect(compare).toMatch(/\.compare-table\s*\{[^}]*table-layout:\s*fixed/)
  })

  it('reserves the loupe caption and tile rows so side-by-side cards align', () => {
    expect(scenario).toMatch(/\.views__zoomslot\s*\{[^}]*min-height/)
    expect(scenario).toMatch(/\.countdown:nth-child\(n \+ 3\)/)
  })
})
