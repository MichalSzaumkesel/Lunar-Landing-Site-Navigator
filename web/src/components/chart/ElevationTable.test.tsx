// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElevationTable } from './ElevationTable'
import type { ElevationPoint } from './elevationSeries'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeMockPoints(count: number): ElevationPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    relH: i,
    timeMs: 1764547200000 + i * 3600_000,
    utcIso: `2026-12-01 ${String(i % 24).padStart(2, '0')}:00 UTC`,
    sunClearanceDeg: i % 2 === 0 ? 3.5 : -1.2,
    earthClearanceDeg: 12.0,
    sunElDeg: 5.0,
    earthElDeg: 13.5,
    sunHorizonElDeg: 1.5,
    earthHorizonElDeg: 1.5,
    sunVisible: i % 2 === 0,
    earthVisible: true,
  }))
}

describe('ElevationTable component', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('renders an accessible table with caption and column headers', () => {
    const series = makeMockPoints(10)
    act(() => {
      root.render(
        createElement(ElevationTable, {
          series,
          cursorH: 0,
          onSelectHour: vi.fn(),
        }),
      )
    })

    const table = container.querySelector('table.elevation-table')
    expect(table).toBeTruthy()

    const caption = table?.querySelector('caption')
    expect(caption?.textContent).toBe(
      'Sun and Earth elevation above the horizon over time',
    )

    const headers = Array.from(table?.querySelectorAll('th[scope="col"]') ?? []).map(
      (th) => th.textContent,
    )
    expect(headers).toContain('Time (UTC)')
    expect(headers).toContain('Hour')
    expect(headers).toContain('Sun elevation above horizon')
    expect(headers).toContain('Sun status')
    expect(headers).toContain('Earth elevation above horizon')
    expect(headers).toContain('Earth status')
  })

  it('strictly adheres to wording rules for visibility statuses', () => {
    const series = makeMockPoints(4)
    act(() => {
      root.render(
        createElement(ElevationTable, {
          series,
          cursorH: 0,
          onSelectHour: vi.fn(),
        }),
      )
    })

    const text = container.textContent ?? ''
    expect(text).toContain('Sun visible')
    expect(text).toContain('Sun below horizon')
    expect(text).toContain('Earth in view')

    const forbidden = ['power', 'energy', 'signal', 'link', 'best site']
    for (const word of forbidden) {
      expect(text.toLowerCase()).not.toContain(word)
    }
  })

  it('limits rows to 200 when series has more than 200 items', () => {
    const series = makeMockPoints(250)
    act(() => {
      root.render(
        createElement(ElevationTable, {
          series,
          cursorH: 10,
          onSelectHour: vi.fn(),
          maxRows: 200,
        }),
      )
    })

    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(200)

    const note = container.querySelector('.elevation-table__caption-note')
    expect(note).toBeTruthy()
    expect(note?.textContent).toContain('Showing 200 of 250 hourly rows')
  })

  it('highlights the cursor row and allows clicking to jump hour', () => {
    const series = makeMockPoints(5)
    const selectSpy = vi.fn()

    act(() => {
      root.render(
        createElement(ElevationTable, {
          series,
          cursorH: 2,
          onSelectHour: selectSpy,
        }),
      )
    })

    const rows = container.querySelectorAll('tbody tr')
    expect(rows[2].classList.contains('is-cursor')).toBe(true)
    expect(rows[2].getAttribute('aria-current')).toBe('time')

    act(() => {
      rows[3].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(selectSpy).toHaveBeenCalledWith(3)
  })

  it('allows keyboard Enter or Space to select an hour', () => {
    const series = makeMockPoints(5)
    const selectSpy = vi.fn()

    act(() => {
      root.render(
        createElement(ElevationTable, {
          series,
          cursorH: 0,
          onSelectHour: selectSpy,
        }),
      )
    })

    const rows = container.querySelectorAll('tbody tr')
    act(() => {
      rows[1].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    expect(selectSpy).toHaveBeenCalledWith(1)

    act(() => {
      rows[4].dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      )
    })
    expect(selectSpy).toHaveBeenCalledWith(4)
  })
})
