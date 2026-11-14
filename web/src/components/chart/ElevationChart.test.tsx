// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElevationLineChart } from './ElevationChart'
import type { ElevationPoint } from './elevationSeries'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function makeMockSeries(): ElevationPoint[] {
  return Array.from({ length: 25 }, (_, i) => ({
    relH: i,
    timeMs: 1764547200000 + i * 3600_000,
    utcIso: `2026-12-01 ${String(i).padStart(2, '0')}:00 UTC`,
    sunClearanceDeg: 2.5 + Math.sin((i / 24) * Math.PI * 2) * 4,
    earthClearanceDeg: 8.0 - i * 0.1,
    sunElDeg: 4.0,
    earthElDeg: 9.5,
    sunHorizonElDeg: 1.5,
    earthHorizonElDeg: 1.5,
    sunVisible: true,
    earthVisible: true,
  }))
}

describe('ElevationChart component', () => {
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

  it('renders SVG with a zero line labelled "Horizon"', () => {
    const series = makeMockSeries()
    act(() => {
      root.render(
        createElement(ElevationLineChart, {
          series,
          startH: 0,
          endH: 24,
          durationH: 24,
          cursorH: 5,
          cursorPoint: series[5],
          playing: false,
          onSeek: vi.fn(),
        }),
      )
    })

    const svg = container.querySelector('svg.elevation-chart-svg')
    expect(svg).toBeTruthy()

    // Zero line
    const zeroLine = container.querySelector('.chart__zero-line')
    expect(zeroLine).toBeTruthy()

    // Labelled "Horizon"
    const zeroLabel = container.querySelector('.chart__zero-label')
    expect(zeroLabel).toBeTruthy()
    expect(zeroLabel?.textContent).toBe('Horizon')
  })

  it('renders d3 paths for Sun and Earth elevation series', () => {
    const series = makeMockSeries()
    act(() => {
      root.render(
        createElement(ElevationLineChart, {
          series,
          startH: 0,
          endH: 24,
          durationH: 24,
          cursorH: 5,
          cursorPoint: series[5],
          playing: false,
          onSeek: vi.fn(),
        }),
      )
    })

    const sunPath = container.querySelector('path.chart__line--sun')
    const earthPath = container.querySelector('path.chart__line--earth')
    expect(sunPath).toBeTruthy()
    expect(earthPath).toBeTruthy()
    expect(sunPath?.getAttribute('d')).toBeTruthy()
    expect(earthPath?.getAttribute('d')).toBeTruthy()
  })

  it('renders cursor vertical indicator and highlights when cursor is in view', () => {
    const series = makeMockSeries()
    act(() => {
      root.render(
        createElement(ElevationLineChart, {
          series,
          startH: 0,
          endH: 24,
          durationH: 24,
          cursorH: 10,
          cursorPoint: series[10],
          playing: false,
          onSeek: vi.fn(),
        }),
      )
    })

    const cursorLine = container.querySelector('.chart__cursor-line')
    expect(cursorLine).toBeTruthy()

    const sunPt = container.querySelector('.chart__cursor-point--sun')
    const earthPt = container.querySelector('.chart__cursor-point--earth')
    expect(sunPt).toBeTruthy()
    expect(earthPt).toBeTruthy()
  })

  it('responds to pointer click on interactive overlay to call onSeek', () => {
    const series = makeMockSeries()
    const seekSpy = vi.fn()

    act(() => {
      root.render(
        createElement(ElevationLineChart, {
          series,
          startH: 0,
          endH: 24,
          durationH: 24,
          cursorH: 0,
          cursorPoint: series[0],
          playing: false,
          onSeek: seekSpy,
        }),
      )
    })

    const overlay = container.querySelector('.chart__overlay-interactive')
    expect(overlay).toBeTruthy()

    // Mock getBoundingClientRect
    const svg = container.querySelector('svg')
    if (svg) {
      svg.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 600,
        bottom: 180,
        width: 600,
        height: 180,
        x: 0,
        y: 0,
        toJSON: () => {},
      })
    }

    act(() => {
      overlay?.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 300,
        }),
      )
    })

    expect(seekSpy).toHaveBeenCalled()
  })

  it('handles keyboard navigation with arrow keys', () => {
    const series = makeMockSeries()
    const seekSpy = vi.fn()

    act(() => {
      root.render(
        createElement(ElevationLineChart, {
          series,
          startH: 0,
          endH: 24,
          durationH: 24,
          cursorH: 10,
          cursorPoint: series[10],
          playing: false,
          onSeek: seekSpy,
        }),
      )
    })

    const svg = container.querySelector('svg')
    act(() => {
      svg?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    expect(seekSpy).toHaveBeenCalledWith(11)

    act(() => {
      svg?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      )
    })
    expect(seekSpy).toHaveBeenCalledWith(9)
  })

  it('includes is-playing class during play and has accessible slider semantics', () => {
    const series = makeMockSeries()
    act(() => {
      root.render(
        createElement(ElevationLineChart, {
          series,
          startH: 0,
          endH: 24,
          durationH: 24,
          cursorH: 8,
          cursorPoint: series[8],
          playing: true,
          onSeek: vi.fn(),
        }),
      )
    })

    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('is-playing')).toBe(true)
    expect(svg?.getAttribute('role')).toBe('slider')
    expect(svg?.getAttribute('aria-valuenow')).toBe('8')
    expect(svg?.getAttribute('aria-label')).toBe(
      'Sun and Earth elevation above the horizon over time',
    )
  })
})
