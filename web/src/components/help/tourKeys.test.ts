// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { describeKeyTarget, tourKeyAction, type TourKeyInput } from './tourKeys'

const base: TourKeyInput = {
  key: '',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  targetInTour: false,
  targetInOtherWidget: false,
  targetEditable: false,
  targetNoShortcuts: false,
  canGoBack: true,
}
const act = (over: Partial<TourKeyInput>) => tourKeyAction({ ...base, ...over })

describe('tourKeyAction', () => {
  it('maps Escape and the arrows from anywhere on the page', () => {
    expect(act({ key: 'Escape' })).toBe('close')
    expect(act({ key: 'ArrowRight' })).toBe('next')
    expect(act({ key: 'ArrowLeft' })).toBe('back')
    expect(act({ key: 'ArrowLeft', targetInTour: true })).toBe('back')
  })

  it('ignores ArrowLeft on the first step and unrelated keys', () => {
    expect(act({ key: 'ArrowLeft', canGoBack: false })).toBeNull()
    expect(act({ key: 'Enter' })).toBeNull()
    expect(act({ key: 'a' })).toBeNull()
  })

  it('leaves handled events and modified keys alone', () => {
    expect(act({ key: 'Escape', defaultPrevented: true })).toBeNull()
    expect(act({ key: 'ArrowRight', ctrlKey: true })).toBeNull()
    expect(act({ key: 'Escape', metaKey: true })).toBeNull()
    expect(act({ key: 'Escape', altKey: true })).toBeNull()
  })

  it('does not take keys from menus, dialogs, sliders, text fields or the 3D view', () => {
    expect(act({ key: 'Escape', targetInOtherWidget: true })).toBeNull()
    expect(act({ key: 'ArrowRight', targetInOtherWidget: true })).toBeNull()
    expect(act({ key: 'ArrowRight', targetEditable: true })).toBeNull()
    expect(act({ key: 'Escape', targetEditable: true })).toBeNull()
    expect(act({ key: 'ArrowRight', targetNoShortcuts: true })).toBeNull()
    // Escape still closes the tour when focus sits in the 3D view
    expect(act({ key: 'Escape', targetNoShortcuts: true })).toBe('close')
  })
})

describe('describeKeyTarget', () => {
  const card = document.createElement('div')
  card.innerHTML = '<button id="in">x</button><input type="checkbox" id="cb">'
  document.body.append(card)
  const mk = (html: string) => {
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    return host.firstElementChild as HTMLElement
  }

  it('recognises the tour card, widgets, text inputs and opt-out areas', () => {
    expect(describeKeyTarget(card.querySelector('#in'), card).targetInTour).toBe(true)
    expect(describeKeyTarget(document.body, card).targetInTour).toBe(false)
    expect(describeKeyTarget(card.querySelector('#cb'), card).targetEditable).toBe(false)
    expect(describeKeyTarget(mk('<input type="text">'), card).targetEditable).toBe(true)
    expect(describeKeyTarget(mk('<div role="menu"><button>i</button></div>').firstElementChild, card).targetInOtherWidget).toBe(true)
    expect(describeKeyTarget(mk('<input type="range">'), card).targetInOtherWidget).toBe(true)
    expect(describeKeyTarget(mk('<div role="dialog" aria-modal="true"><button>i</button></div>').firstElementChild, card).targetInOtherWidget).toBe(true)
    expect(describeKeyTarget(mk('<div role="dialog" aria-modal="false"><button>i</button></div>').firstElementChild, card).targetInOtherWidget).toBe(false)
    expect(describeKeyTarget(mk('<div data-no-shortcuts><canvas></canvas></div>').firstElementChild, card).targetNoShortcuts).toBe(true)
  })
})
