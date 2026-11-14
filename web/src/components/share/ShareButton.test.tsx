// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('ShareButton', () => {
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
    vi.useRealTimers()
  })

  it('renders a button with text "Copy link"', async () => {
    await act(async () => {
      root.render(createElement(ShareButton))
    })

    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    expect(button?.textContent).toBe('Copy link')
  })

  it('copies url and displays "Link copied" in aria-live region when clipboard is available', async () => {
    vi.useFakeTimers()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    await act(async () => {
      root.render(createElement(ShareButton))
    })

    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
    })

    expect(writeTextMock).toHaveBeenCalled()

    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion?.textContent).toBe('Link copied')

    // After 2 seconds, text clears
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // Then the exit animation.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(liveRegion?.textContent).toBe('')

    vi.unstubAllGlobals()
  })

  it('shows fallback input and error message when clipboard API fails', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
    })

    await act(async () => {
      root.render(createElement(ShareButton))
    })

    const button = container.querySelector('button')!
    await act(async () => {
      button.click()
    })

    const error = container.querySelector('[role="alert"]')
    expect(error?.textContent).toBe(
      'Could not copy. Copy the address from the box.',
    )

    const fallbackInput = container.querySelector(
      'input[type="text"]',
    ) as HTMLInputElement
    expect(fallbackInput).not.toBeNull()
    expect(fallbackInput.readOnly).toBe(true)

    vi.unstubAllGlobals()
  })
})
