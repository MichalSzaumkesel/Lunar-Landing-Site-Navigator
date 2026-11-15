import { useCallback, useEffect, useState } from 'react'
import type { RefObject } from 'react'

interface FsDocument extends Document {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export type FullscreenMode = 'native' | 'pseudo' | 'none'

export interface FullscreenControl {
  /** 'native' uses the Fullscreen API, 'pseudo' is a CSS overlay (iOS Safari), 'none' means hide the control. */
  mode: FullscreenMode
  active: boolean
  toggle: () => void
  exit: () => void
}

const EVENTS = ['fullscreenchange', 'webkitfullscreenchange']

function fsElement(doc: FsDocument): Element | null {
  return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
}

// iPhone Safari has no element fullscreen; iPadOS reports a Mac platform with touch points.
function isIos(): boolean {
  const nav = navigator
  return /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

export function detectMode(target: FsElement | null): FullscreenMode {
  if (typeof document === 'undefined') return 'none'
  const doc = document as FsDocument
  const enabled = doc.fullscreenEnabled ?? doc.webkitFullscreenEnabled
  const canRequest = Boolean(target && (target.requestFullscreen || target.webkitRequestFullscreen))
  if (canRequest && enabled !== false) return 'native'
  if (!canRequest && enabled === undefined && isIos()) return 'pseudo'
  return 'none'
}

/**
 * Fullscreen for one element. While active the target carries data-fullscreen="true", which
 * pages style (the 'pseudo' mode relies on it, see FullscreenButton.css). Escape is handled by
 * the browser; the pseudo overlay handles it here.
 */
export function useFullscreen(targetRef: RefObject<HTMLElement | null>): FullscreenControl {
  const [mode, setMode] = useState<FullscreenMode>('none')
  const [active, setActive] = useState(false)

  // The target ref is only set after mount, so capability is detected in an effect.
  useEffect(() => {
    setMode(detectMode(targetRef.current))
  }, [targetRef])

  useEffect(() => {
    if (mode !== 'native') return
    const doc = document as FsDocument
    const el = targetRef.current
    const sync = () => setActive(fsElement(doc) !== null && fsElement(doc) === targetRef.current)
    // Read the real state once: the owner may have been (re)mounted while already fullscreen.
    sync()
    EVENTS.forEach((e) => document.addEventListener(e, sync))
    return () => {
      EVENTS.forEach((e) => document.removeEventListener(e, sync))
      // An owner unmounting while it is the fullscreen element must not leave the page stuck.
      if (fsElement(doc) !== null && fsElement(doc) === el) void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
    }
  }, [mode, targetRef])

  useEffect(() => {
    const el = targetRef.current
    if (!el) return
    if (active) el.setAttribute('data-fullscreen', 'true')
    else el.removeAttribute('data-fullscreen')
  }, [active, targetRef])

  const exit = useCallback(() => {
    if (mode === 'pseudo') {
      setActive(false)
      return
    }
    const doc = document as FsDocument
    if (!fsElement(doc)) return
    void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
  }, [mode])

  useEffect(() => {
    if (mode !== 'pseudo' || !active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActive(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mode, active])

  const toggle = useCallback(() => {
    if (active) {
      exit()
      return
    }
    if (mode === 'pseudo') {
      setActive(true)
      return
    }
    const el = targetRef.current as FsElement | null
    if (!el) return
    // A rejected request (denied by the browser) leaves the state unchanged.
    void Promise.resolve(el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()).catch(() => undefined)
  }, [active, exit, mode, targetRef])

  return { mode, active, toggle, exit }
}
