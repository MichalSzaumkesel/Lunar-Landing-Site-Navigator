// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SwapText } from './SwapText'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (v: string) => act(() => root.render(<SwapText value={v} />))
const span = () => host.querySelector('span') as HTMLElement

describe('SwapText', () => {
  it('renders the first value without the animation class', () => {
    render('12 %')
    expect(span().textContent).toBe('12 %')
    expect(span().classList.contains('swap-text')).toBe(false)
  })

  it('re-creates the element with the animation class when the value changes', () => {
    render('12 %')
    const first = span()
    render('40 %')
    expect(span().textContent).toBe('40 %')
    expect(span().classList.contains('swap-text')).toBe(true)
    expect(span()).not.toBe(first)
  })

  it('keeps the same element while the value stays the same, so the animation does not restart', () => {
    render('12 %')
    render('40 %')
    const el = span()
    render('40 %')
    expect(span()).toBe(el)
  })

  it('animates again on every further change', () => {
    render('a')
    render('b')
    const afterB = span()
    render('c')
    expect(span()).not.toBe(afterB)
    expect(span().textContent).toBe('c')
  })
})
