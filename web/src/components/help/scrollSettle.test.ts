// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFullyInView, scrollIntoUsableView, usableViewBand } from './scrollSettle'

function box(top: number, bottom: number, left = 10, right = 110): DOMRect {
  return { top, bottom, left, right, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect
}

describe('usable view band (sticky transport)', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  const setup = (footerTop: number | null, position = 'sticky') => {
    document.body.innerHTML = '<div class="app__footer"></div><div id="t"></div>'
    const footer = document.querySelector('.app__footer') as HTMLElement
    const target = document.getElementById('t') as HTMLElement
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
    Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true })
    footer.style.position = position
    if (footerTop !== null) footer.getBoundingClientRect = () => box(footerTop, 768, 0, 1366)
    return target
  }

  it('ends where the sticky footer starts', () => {
    setup(699)
    expect(usableViewBand()).toEqual({ top: 0, bottom: 699 })
  })

  it('is the whole viewport without a sticky footer (phone: transport in the flow)', () => {
    setup(691, 'static')
    expect(usableViewBand()).toEqual({ top: 0, bottom: 768 })
  })

  it('treats a target under the bar as not fully in view (frame 53..715 vs bar at 699)', () => {
    const el = setup(699)
    el.getBoundingClientRect = () => box(53, 715)
    expect(isFullyInView(el)).toBe(false)
    el.getBoundingClientRect = () => box(53, 690)
    expect(isFullyInView(el)).toBe(true)
  })

  it('scrolls a target that fits to the centre of the band and a tall one to the top, then restores margins', () => {
    const el = setup(699)
    const spy = vi.fn()
    el.scrollIntoView = spy as never
    el.getBoundingClientRect = () => box(500, 700)
    const restore = scrollIntoUsableView(el, 'auto')
    expect(spy).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'auto' })
    expect(el.style.scrollMarginBottom).toBe('69px')
    restore()
    expect(el.style.scrollMarginBottom).toBe('')

    el.getBoundingClientRect = () => box(0, 690)
    scrollIntoUsableView(el, 'smooth')
    expect(spy).toHaveBeenLastCalledWith({ block: 'start', inline: 'nearest', behavior: 'smooth' })
  })
})
