import { useEffect } from 'react'
import { useAppStore } from '../state/store'

export interface ShortcutInput {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  targetTag: string
  targetRole: string | null
  targetEditable: boolean
  targetInDialog: boolean
  defaultPrevented?: boolean
  targetNoShortcuts?: boolean
}

export type ShortcutAction =
  | { type: 'toggle-play' }
  | { type: 'seek'; deltaH: number }

const IGNORED_ROLES = new Set([
  'tab',
  'tablist',
  'menu',
  'grid',
  'region',
  'application',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'radio',
  'radiogroup',
  'listbox',
  'option',
])

/**
 * Pure mapping from keyboard event properties to an app action.
 */
export function shortcutAction(e: ShortcutInput): ShortcutAction | null {
  if (e.defaultPrevented) {
    return null
  }
  if (e.ctrlKey || e.metaKey || e.altKey) {
    return null
  }
  if (e.targetInDialog || e.targetEditable || e.targetNoShortcuts) {
    return null
  }

  const isSpace = e.key === ' ' || e.key === 'Space'
  const isArrowRight = e.key === 'ArrowRight'
  const isArrowLeft = e.key === 'ArrowLeft'

  if (!isSpace && !isArrowRight && !isArrowLeft) {
    return null
  }

  const tag = e.targetTag.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return null
  }
  if ((tag === 'button' || tag === 'a') && isSpace) {
    return null
  }

  const role = e.targetRole?.toLowerCase()
  if (role) {
    if (role === 'slider') {
      if (isArrowRight || isArrowLeft) {
        return null
      }
    } else if (IGNORED_ROLES.has(role)) {
      return null
    }
  }

  if (isSpace) {
    return { type: 'toggle-play' }
  }
  if (isArrowRight) {
    return { type: 'seek', deltaH: e.shiftKey ? 24 : 1 }
  }
  if (isArrowLeft) {
    return { type: 'seek', deltaH: e.shiftKey ? -24 : -1 }
  }

  return null
}

/**
 * Listens to keydown on window and applies shortcuts to the store.
 */
export function useShortcuts(): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented) return

      const target = e.target as HTMLElement | null
      const targetTag = target?.tagName?.toLowerCase() ?? ''

      const closestGrid = target?.closest?.('[role="grid"]')
      const closestApp = target?.closest?.('[role="application"]')
      const closestRegion = target?.closest?.(
        '[role="region"][tabindex], [role="region"][tabIndex]',
      )
      const closestMenu = target?.closest?.('[role="menu"], [role="radiogroup"], [role="listbox"]')
      const ancestorRole = closestMenu
        ? 'menu'
        : closestGrid
          ? 'grid'
          : closestApp
            ? 'application'
            : closestRegion
              ? 'region'
              : null

      const targetRole = target?.getAttribute?.('role') ?? ancestorRole
      const targetEditable = Boolean(
        target?.isContentEditable ||
          target?.getAttribute?.('contenteditable') === 'true',
      )
      const targetInDialog = Boolean(target?.closest?.('[role="dialog"]'))
      const targetNoShortcuts = Boolean(target?.closest?.('[data-no-shortcuts]'))

      const action = shortcutAction({
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        defaultPrevented: e.defaultPrevented,
        targetTag,
        targetRole,
        targetEditable,
        targetInDialog,
        targetNoShortcuts,
      })

      if (!action) return

      e.preventDefault()

      const state = useAppStore.getState()
      if (action.type === 'toggle-play') {
        state.togglePlaying()
      } else if (action.type === 'seek') {
        state.setCursorH(Math.max(0, state.cursorH + action.deltaH))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
