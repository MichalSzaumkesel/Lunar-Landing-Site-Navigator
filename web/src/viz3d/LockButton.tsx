import { useEffect, useEffectEvent, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createHoldTimer, HOLD_MS, holdHint, lockedLabel } from './cameraLock'
import type { HoldTimer, LockBody } from './cameraLock'

const HINT_KEY = 'lunar.lockHintSeen'
let hintSeen = false

function readHintSeen(): boolean {
  if (hintSeen) return true
  try {
    hintSeen = localStorage.getItem(HINT_KEY) === '1'
  } catch {
    // storage unavailable: the hint stays per page load
  }
  return hintSeen
}

function markHintSeen(): void {
  hintSeen = true
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    // storage unavailable
  }
}

function Padlock({ open }: { open: boolean }) {
  return (
    <svg className="lockbtn__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" />
      <path
        className="lockbtn__shackle"
        d={open ? 'M5.5 7V4.8a2.5 2.5 0 0 1 4.9-.7' : 'M5.5 7V4.8a2.5 2.5 0 0 1 5 0V7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LanderIcon() {
  return (
    <svg className="lockbtn__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M5 3.5h6l1 4H4z" fill="currentColor" />
      <path d="M4 9h8M5 9l-2 4.5M11 9l2 4.5M2 13.5h3M11 13.5h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  body: LockBody
  children: ReactNode
  title: string
  disabled?: boolean
  locked: boolean
  /** Short press. */
  onClick: () => void
  /** Held long enough. */
  onLock: () => void
  /** Click on the locked button. */
  onUnlock: () => void
}

/** A button that moves the camera on click and locks it on its target when held. */
export function LockButton({ body, children, title, disabled, locked, onClick, onLock, onUnlock }: Props) {
  const [holding, setHolding] = useState(false)
  const [wasLocked, setWasLocked] = useState(false)
  const swallowClick = useRef(false)
  const fireLock = useEffectEvent(() => {
    swallowClick.current = true
    setHolding(false)
    markHintSeen()
    onLock()
  })

  const timerRef = useRef<HoldTimer | null>(null)
  useEffect(() => {
    const t = createHoldTimer({ holdMs: HOLD_MS, onLock: () => fireLock() })
    timerRef.current = t
    return () => {
      t.cancel()
      timerRef.current = null
    }
  }, [])

  // The padlock opens once when the lock ends.
  const [prevLocked, setPrevLocked] = useState(locked)
  if (prevLocked !== locked) {
    setPrevLocked(locked)
    if (locked) setWasLocked(true)
  }
  const opening = wasLocked && !locked

  const begin = () => {
    if (disabled || locked) return
    setHolding(true)
    timerRef.current?.start()
  }
  const end = (): boolean => {
    setHolding(false)
    return timerRef.current?.cancel() ?? false
  }
  const hint = holdHint(body)
  const tip = locked ? `${lockedLabel(body)}. Click to unlock` : readHintSeen() ? title : `${title}. ${hint}`

  return (
    <button
      type="button"
      className="lockbtn"
      data-body={body}
      data-holding={holding || undefined}
      data-locked={locked || undefined}
      aria-pressed={locked}
      aria-description={hint}
      disabled={disabled}
      title={tip}
      style={{ '--hold-ms': `${HOLD_MS}ms` } as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        swallowClick.current = false
        begin()
      }}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return
        e.preventDefault()
        if (!e.repeat) begin()
      }}
      onKeyUp={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return
        e.preventDefault()
        if (disabled) return
        if (end()) {
          swallowClick.current = false
          return
        }
        if (locked) onUnlock()
        else onClick()
      }}
      onBlur={() => void end()}
      onClick={() => {
        if (swallowClick.current) {
          swallowClick.current = false
          return
        }
        if (locked) onUnlock()
        else onClick()
      }}
    >
      {holding && (
        <svg className="lockbtn__ring" aria-hidden="true" focusable="false">
          <rect x="1" y="1" pathLength="100" />
        </svg>
      )}
      {locked ? <Padlock open={false} /> : opening ? <Padlock open /> : body === 'lander' ? <LanderIcon /> : null}
      <span>{locked ? lockedLabel(body) : children}</span>
    </button>
  )
}
