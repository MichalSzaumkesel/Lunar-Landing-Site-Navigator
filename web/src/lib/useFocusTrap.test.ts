// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { focusableIn, nextTrapTarget } from './useFocusTrap'

function setup() {
  document.body.innerHTML =
    '<div id="root"><button id="a">A</button><button id="off" disabled>x</button><a id="b" href="#">B</a>' +
    '<button id="skip" tabindex="-1">s</button><div inert><button id="inert">i</button></div><input id="c" /></div>'
  const root = document.getElementById('root') as HTMLElement
  return { root, items: focusableIn(root) }
}

describe('focus trap helpers', () => {
  it('lists enabled, tabbable, non-inert elements in DOM order', () => {
    expect(setup().items.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('wraps forward from the last and backward from the first element', () => {
    const { items } = setup()
    expect(nextTrapTarget(items, items[2], false, true)?.id).toBe('a')
    expect(nextTrapTarget(items, items[0], true, true)?.id).toBe('c')
  })

  it('leaves the browser default in the middle of the dialog', () => {
    const { items } = setup()
    expect(nextTrapTarget(items, items[1], false, true)).toBeNull()
    expect(nextTrapTarget(items, items[1], true, true)).toBeNull()
  })

  it('pulls focus in when it is outside the container', () => {
    const { items } = setup()
    expect(nextTrapTarget(items, document.body, false, false)?.id).toBe('a')
    expect(nextTrapTarget(items, document.body, true, false)?.id).toBe('c')
  })

  it('does nothing for an empty container', () => {
    expect(nextTrapTarget([], null, false, false)).toBeNull()
  })
})
