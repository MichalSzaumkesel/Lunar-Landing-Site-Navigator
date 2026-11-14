// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Scenario } from '../../state/types'
import { useAppStore } from '../../state/store'
import type { SiteBundleState } from '../../lib/useSiteBundle'

const mockUseSiteBundle = vi.fn()
vi.mock('../../lib/useSiteBundle', () => ({
  useSiteBundle: (siteId: string) => mockUseSiteBundle(siteId),
}))

import { SkyReadout } from './SkyReadout'

// Tell React this is an act() environment
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement

const testScenario: Scenario = {
  id: 'sc1',
  siteId: 'test_site',
  startUtc: '2027-01-01T00:00:00Z',
  durationH: 24,
  slipDays: 0,
}

beforeEach(() => {
  mockUseSiteBundle.mockReset()
  useAppStore.setState({
    scenarios: [testScenario],
    activeScenarioId: 'sc1',
    observerHeightM: 2,
    cursorH: 0,
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  root = null
  container.remove()
})

describe('SkyReadout - error and loading states (L5 #2)', () => {
  it('renders role="alert" and a retry button on error', async () => {
    mockUseSiteBundle.mockReturnValue({
      status: 'error',
      bundle: null,
      error: 'Network connection failed',
    } satisfies SiteBundleState)

    await act(async () => {
      root!.render(createElement(SkyReadout, { scenarioId: 'sc1' }))
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Network connection failed')

    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button?.textContent).toBe('Retry')
  })

  it('renders loading skeleton with aria-busy="true" during loading', async () => {
    mockUseSiteBundle.mockReturnValue({
      status: 'loading',
      bundle: null,
      error: null,
    } satisfies SiteBundleState)

    await act(async () => {
      root!.render(createElement(SkyReadout, { scenarioId: 'sc1' }))
    })

    const skeleton = container.querySelector('[aria-busy="true"]')
    expect(skeleton).not.toBeNull()
  })
})
