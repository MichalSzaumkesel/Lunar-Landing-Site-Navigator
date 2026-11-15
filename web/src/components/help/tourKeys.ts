export type TourKeyAction = 'close' | 'next' | 'back'

export interface TourKeyInput {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  defaultPrevented: boolean
  /** The tour card itself holds focus (or the target is inside it). */
  targetInTour: boolean
  /** Target is inside a menu, list, radio group, slider or another modal dialog that owns its keys. */
  targetInOtherWidget: boolean
  /** Target is a text field, select or contenteditable element. */
  targetEditable: boolean
  /** Target opted out of page shortcuts (for example the 3D view, which turns the camera on arrows). */
  targetNoShortcuts: boolean
  canGoBack: boolean
}

const OTHER_WIDGETS =
  '[role="menu"], [role="listbox"], [role="radiogroup"], [role="slider"], [role="tablist"], [role="grid"], ' +
  '[role="dialog"][aria-modal="true"], input[type="range"], select'

/**
 * Keys that drive the open tour from anywhere on the page: Escape closes, Right/Left step.
 * Widgets that handle the same keys themselves (menus, dialogs, sliders, the 3D view) keep them.
 */
export function tourKeyAction(e: TourKeyInput): TourKeyAction | null {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null
  if (e.targetEditable) return null
  if (!e.targetInTour && e.targetInOtherWidget) return null
  if (e.key === 'Escape') return 'close'
  if (e.targetNoShortcuts) return null
  if (e.key === 'ArrowRight') return 'next'
  if (e.key === 'ArrowLeft') return e.canGoBack ? 'back' : null
  return null
}

export function describeKeyTarget(
  target: EventTarget | null,
  card: Element | null,
): Pick<TourKeyInput, 'targetInTour' | 'targetInOtherWidget' | 'targetEditable' | 'targetNoShortcuts'> {
  const el = target instanceof Element ? target : null
  const tag = el?.tagName?.toLowerCase() ?? ''
  const type = (el as HTMLInputElement | null)?.type
  const textInput = tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes(type ?? '')
  return {
    targetInTour: Boolean(el && card?.contains(el)),
    targetInOtherWidget: Boolean(el?.closest(OTHER_WIDGETS)),
    targetEditable: Boolean(
      textInput || tag === 'textarea' || (el as HTMLElement | null)?.isContentEditable,
    ),
    targetNoShortcuts: Boolean(el?.closest('[data-no-shortcuts]')),
  }
}
