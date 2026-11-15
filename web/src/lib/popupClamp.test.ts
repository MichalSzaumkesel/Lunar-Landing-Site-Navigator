import { describe, expect, it } from 'vitest'
import { placePopup } from './popupClamp'

const trigger = { top: 100, bottom: 140 }

describe('placePopup', () => {
  it('leaves a popup that already fits alone', () => {
    const p = placePopup({ left: 20, right: 372, height: 200 }, trigger, { width: 1366, height: 768 })
    expect(p.dx).toBe(0)
    expect(p.flip).toBe(false)
  })

  it('pulls a popup hanging off the left edge back inside (phone Share menu)', () => {
    // 352 px wide popup right-aligned to a trigger that ends at x=224: left = -128
    const p = placePopup({ left: -128, right: 224, height: 290 }, trigger, { width: 390, height: 844 })
    expect(p.dx).toBe(136)
    expect(-128 + p.dx).toBe(8)
  })

  it('pulls a popup hanging off the right edge back inside', () => {
    const p = placePopup({ left: 600, right: 960, height: 100 }, trigger, { width: 844, height: 390 })
    expect(p.dx).toBe(844 - 8 - 960)
  })

  it('aligns a popup wider than the viewport to the left margin', () => {
    const p = placePopup({ left: -50, right: 400, height: 100 }, trigger, { width: 390, height: 844 })
    expect(p.dx).toBe(58)
  })

  it('caps the height to the room below and scrolls inside (landscape phone)', () => {
    const p = placePopup({ left: 10, right: 360, height: 290 }, { top: 120, bottom: 160 }, { width: 844, height: 390 })
    expect(p.flip).toBe(false)
    expect(p.maxHeight).toBe(390 - 160 - 6 - 8)
    expect(p.maxHeight).toBeLessThan(290)
  })

  it('flips above the trigger when there is more room there', () => {
    const p = placePopup({ left: 10, right: 360, height: 290 }, { top: 330, bottom: 370 }, { width: 844, height: 390 })
    expect(p.flip).toBe(true)
    expect(p.maxHeight).toBe(330 - 6 - 8)
  })

  it('never returns a negative height', () => {
    const p = placePopup({ left: 0, right: 100, height: 50 }, { top: 0, bottom: 400 }, { width: 400, height: 390 })
    expect(p.maxHeight).toBeGreaterThanOrEqual(0)
  })
})
