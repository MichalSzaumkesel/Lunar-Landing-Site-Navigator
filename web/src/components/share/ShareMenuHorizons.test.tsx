// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../../state/store'
import type { SiteBundle } from '../../lib/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const QUERY = { CENTER: "'coord@301'", SITE_COORD: "'23.473100,0.674200,-1.928000'", STEP_SIZE: "'1h'" }

vi.mock('../../lib/loader', () => {
  const meta = { contract_version: '1.1.1', generated_utc: 'x', generator: 't', synthetic: false, approximate: false, inputs: [] }
  const mk = (id: string, q?: Record<string, string>) =>
    ({
      site: { id, name: id, category: 'apollo', lat_deg: 0, lon_deg: 0 },
      synthetic: false,
      approximate: false,
      horizon: { meta, site_id: id, az_step_deg: 360, n: 1, observer_heights_m: [2], masks: { '2': [0] } },
      ephem: { meta, site_id: id, start_utc: '2027-01-01T00:00:00Z', step_minutes: 60, count: 1, sun: { az: [0], el: [1] }, earth: { az: [0], el: [1] }, sun_ang_radius_deg: 0.27, earth_ang_radius_deg: 0.95, ...(q ? { horizons_query: q } : {}) },
    }) as unknown as SiteBundle
  return { dataSource: { loadSite: async (id: string) => (id === 'with_q' ? mk(id, QUERY) : mk(id)) } }
})

const { ShareMenu } = await import('./ShareMenu')

describe('ShareMenu - Copy Horizons query', () => {
  let container: HTMLDivElement
  let root: Root
  const items = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
  const horizonsItem = () => items().find((i) => i.textContent?.includes('Copy Horizons query'))!
  const open = async (siteId: string, advancedDisabled = false) => {
    useAppStore.setState({
      scenarios: [{ id: 'sc1', siteId, startUtc: '2027-01-01T00:00:00Z', durationH: 2, slipDays: 0 }],
      activeScenarioId: 'sc1',
    })
    await act(async () => {
      root.render(createElement(ShareMenu, { advancedDisabled }))
    })
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click()
    })
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
  })

  it('copies the recorded query and confirms with "Copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await open('with_q')
    expect(horizonsItem().disabled).toBe(false)
    await act(async () => {
      horizonsItem().click()
    })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(writeText.mock.calls[0][0])).toEqual(QUERY)
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Copied')
  })

  it('is disabled with "Not recorded for this site." when the file has no query', async () => {
    await open('without_q')
    expect(horizonsItem().disabled).toBe(true)
    expect(horizonsItem().title).toBe('Not recorded for this site.')
    expect(horizonsItem().textContent).toContain('Not recorded for this site.')
  })

  it('shows the Advanced-only hint in Simple mode', async () => {
    await open('with_q', true)
    expect(horizonsItem().disabled).toBe(true)
    expect(horizonsItem().title).toBe('Available only in Advanced mode.')
  })
})
