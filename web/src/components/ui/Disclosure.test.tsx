// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { revealSections, useDisclosureStore } from '../../lib/disclosure'
import { Disclosure } from './Disclosure'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  useDisclosureStore.setState({ stored: {}, forced: [], exploreTab: 'sites' })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root.render(
      <Disclosure sectionKey="dates" title="Dates and slip" summary="Start 2027-10-06">
        <p id="inner">content</p>
      </Disclosure>,
    )
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const button = () => host.querySelector('button') as HTMLButtonElement

describe('Disclosure', () => {
  it('is collapsed by default with the summary visible and the content unmounted', () => {
    expect(button().getAttribute('aria-expanded')).toBe('false')
    expect(host.textContent).toContain('Start 2027-10-06')
    expect(host.querySelector('#inner')).toBeNull()
  })

  it('links the button to its region with aria-controls', () => {
    const id = button().getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id as string)).not.toBeNull()
  })

  it('opens on click and remembers the state', () => {
    act(() => button().click())
    expect(button().getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('#inner')).not.toBeNull()
    expect(localStorage.getItem('lunar.disclosure.dates')).toBe('1')
  })

  it('opens while the tour or demo forces the section', () => {
    act(() => revealSections(['dates']))
    expect(button().getAttribute('aria-expanded')).toBe('true')
    act(() => revealSections([]))
    expect(button().getAttribute('aria-expanded')).toBe('false')
  })
})
