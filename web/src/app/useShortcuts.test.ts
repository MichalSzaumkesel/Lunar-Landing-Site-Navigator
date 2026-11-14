import { describe, expect, it } from 'vitest'
import { shortcutAction } from './useShortcuts'
import type { ShortcutInput } from './useShortcuts'

function baseEvent(overrides: Partial<ShortcutInput> = {}): ShortcutInput {
  return {
    key: 'ArrowRight',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    targetTag: 'div',
    targetRole: null,
    targetEditable: false,
    targetInDialog: false,
    ...overrides,
  }
}

describe('shortcutAction', () => {
  it('toggles play on Space', () => {
    expect(shortcutAction(baseEvent({ key: ' ' }))).toEqual({ type: 'toggle-play' })
    expect(shortcutAction(baseEvent({ key: 'Space' }))).toEqual({ type: 'toggle-play' })
  })

  it('seeks by +1 h and -1 h on ArrowRight and ArrowLeft', () => {
    expect(shortcutAction(baseEvent({ key: 'ArrowRight' }))).toEqual({
      type: 'seek',
      deltaH: 1,
    })
    expect(shortcutAction(baseEvent({ key: 'ArrowLeft' }))).toEqual({
      type: 'seek',
      deltaH: -1,
    })
  })

  it('seeks by +24 h and -24 h with Shift', () => {
    expect(shortcutAction(baseEvent({ key: 'ArrowRight', shiftKey: true }))).toEqual({
      type: 'seek',
      deltaH: 24,
    })
    expect(shortcutAction(baseEvent({ key: 'ArrowLeft', shiftKey: true }))).toEqual({
      type: 'seek',
      deltaH: -24,
    })
  })

  it('returns null when modifier keys (ctrl, meta, alt) are pressed', () => {
    expect(shortcutAction(baseEvent({ key: ' ', ctrlKey: true }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowRight', metaKey: true }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowLeft', altKey: true }))).toBeNull()
  })

  it('returns null when event has defaultPrevented', () => {
    expect(shortcutAction(baseEvent({ key: ' ', defaultPrevented: true }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowRight', defaultPrevented: true }))).toBeNull()
  })

  it('returns null when target has data-no-shortcuts escape hatch', () => {
    expect(shortcutAction(baseEvent({ key: ' ', targetNoShortcuts: true }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowRight', targetNoShortcuts: true }))).toBeNull()
  })

  it('returns null for all shortcuts when focus is on form input controls', () => {
    const tags = ['input', 'INPUT', 'textarea', 'TEXTAREA', 'select', 'SELECT']
    for (const tag of tags) {
      expect(shortcutAction(baseEvent({ key: ' ', targetTag: tag }))).toBeNull()
      expect(shortcutAction(baseEvent({ key: 'ArrowRight', targetTag: tag }))).toBeNull()
      expect(shortcutAction(baseEvent({ key: 'ArrowLeft', targetTag: tag }))).toBeNull()
    }
  })

  it('ignores Space on buttons and links, but allows ArrowRight and ArrowLeft', () => {
    const tags = ['button', 'BUTTON', 'a', 'A']
    for (const tag of tags) {
      // Space is ignored (activates button or link)
      expect(shortcutAction(baseEvent({ key: ' ', targetTag: tag }))).toBeNull()
      expect(shortcutAction(baseEvent({ key: 'Space', targetTag: tag }))).toBeNull()
      // Arrow keys are allowed
      expect(shortcutAction(baseEvent({ key: 'ArrowRight', targetTag: tag }))).toEqual({
        type: 'seek',
        deltaH: 1,
      })
      expect(shortcutAction(baseEvent({ key: 'ArrowLeft', targetTag: tag }))).toEqual({
        type: 'seek',
        deltaH: -1,
      })
    }
  })

  it('allows Space on role="slider" to toggle play, but ignores arrow keys', () => {
    expect(shortcutAction(baseEvent({ key: ' ', targetRole: 'slider' }))).toEqual({
      type: 'toggle-play',
    })
    expect(shortcutAction(baseEvent({ key: 'Space', targetRole: 'slider' }))).toEqual({
      type: 'toggle-play',
    })
    expect(shortcutAction(baseEvent({ key: 'ArrowRight', targetRole: 'slider' }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowLeft', targetRole: 'slider' }))).toBeNull()
  })

  it('returns null when target has composite widget role (grid, region, application, tab, tablist, menu)', () => {
    const roles = ['grid', 'region', 'application', 'tab', 'tablist', 'menu', 'menuitem', 'menuitemradio', 'radio', 'radiogroup', 'listbox', 'option', 'GRID', 'REGION']
    for (const role of roles) {
      expect(shortcutAction(baseEvent({ key: ' ', targetRole: role }))).toBeNull()
      expect(shortcutAction(baseEvent({ key: 'ArrowRight', targetRole: role }))).toBeNull()
      expect(shortcutAction(baseEvent({ key: 'ArrowLeft', targetRole: role }))).toBeNull()
    }
  })

  it('returns null when target is editable', () => {
    expect(shortcutAction(baseEvent({ key: ' ', targetEditable: true }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowRight', targetEditable: true }))).toBeNull()
  })

  it('returns null when target is inside a dialog', () => {
    expect(shortcutAction(baseEvent({ key: ' ', targetInDialog: true }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowRight', targetInDialog: true }))).toBeNull()
  })

  it('returns null for unrelated keys', () => {
    expect(shortcutAction(baseEvent({ key: 'Enter' }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'Escape' }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowUp' }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'ArrowDown' }))).toBeNull()
    expect(shortcutAction(baseEvent({ key: 'a' }))).toBeNull()
  })
})
