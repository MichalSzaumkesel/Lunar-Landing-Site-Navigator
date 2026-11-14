import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { VolumeSlider } from './VolumeSlider'
import {
  getSoundEngine,
  loadSoundPreference,
  saveSoundPreference,
  saveSoundVolume,
  type SoundEngine,
  type SoundMode,
} from '../../lib/sound'
import './sound.css'

const SLIDE_MS = 200

const MODES: { id: SoundMode; label: string; title: string }[] = [
  { id: 'off', label: 'Off', title: 'Turn sound off' },
  { id: 'ambient', label: 'Ambient', title: 'Calm ambient tone that follows Sun and Earth visibility' },
  { id: 'cues', label: 'Cues', title: 'Short tones when the Sun or Earth rises or sets during Play' },
]

export interface SoundToggleProps {
  className?: string
  engine?: SoundEngine
}

/**
 * Three-state sound control: Off / Ambient / Cues, with a volume slider that slides in when sound is on.
 * Default Off; persists choice in localStorage (wrapped in try/catch).
 * AudioContext starts only after user click (autoplay policy).
 */
export function SoundToggle({
  className = '',
  engine: customEngine,
}: SoundToggleProps): ReactElement {
  const engine = customEngine ?? getSoundEngine()
  const [mode, setMode] = useState<SoundMode>(() => {
    return engine.getMode() !== 'off' ? engine.getMode() : loadSoundPreference()
  })
  const [volume, setVolume] = useState<number>(() => {
    return engine.getVolume()
  })

  // Sync state when engine updates
  useEffect(() => {
    const unsubscribe = engine.addListener((newMode) => {
      setMode(newMode)
    })
    return unsubscribe
  }, [engine])

  // If user previously turned sound on, activate on the first user interaction
  useEffect(() => {
    const stored = loadSoundPreference()
    if (stored !== 'off' && engine.getMode() === 'off' && typeof window !== 'undefined') {
      const onFirstGesture = (): void => {
        engine.setMode(stored)
      }
      window.addEventListener('pointerdown', onFirstGesture, { once: true })
      window.addEventListener('keydown', onFirstGesture, { once: true })
      return () => {
        window.removeEventListener('pointerdown', onFirstGesture)
        window.removeEventListener('keydown', onFirstGesture)
      }
    }
  }, [engine])

  const handleModeClick = (newMode: SoundMode): void => {
    setMode(newMode)
    saveSoundPreference(newMode)
    engine.setMode(newMode)
  }

  const radioRefs = useRef<Partial<Record<SoundMode, HTMLButtonElement | null>>>({})

  // WAI-ARIA radio group: one tab stop, arrows move focus and selection.
  const onRadioKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    const idx = MODES.findIndex((m) => m.id === mode)
    let next: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % MODES.length
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + MODES.length) % MODES.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = MODES.length - 1
    else return
    e.preventDefault()
    const id = MODES[next].id
    handleModeClick(id)
    radioRefs.current[id]?.focus()
  }

  const handleVolumeChange = (percent: number): void => {
    const val = percent / 100
    setVolume(val)
    saveSoundVolume(val)
    engine.setVolume(val)
  }

  // Keep the slider mounted during the slide-out, then unmount it
  const wantsSlider = mode !== 'off'
  const [mounted, setMounted] = useState(wantsSlider)
  const [entered, setEntered] = useState(wantsSlider)
  if (wantsSlider && !mounted) setMounted(true)
  const shown = wantsSlider && entered
  useEffect(() => {
    if (wantsSlider) {
      const raf = window.requestAnimationFrame(() => setEntered(true))
      return () => window.cancelAnimationFrame(raf)
    }
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(
      () => {
        setEntered(false)
        setMounted(false)
      },
      reduced ? 0 : SLIDE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [wantsSlider])

  return (
    <div
      className={`sound-control ${className}`.trim()}
      role="group"
      aria-label="Sound controls"
    >
      <div className="sound-control__main">
        <span className="sound-control__label" id="sound-mode-label">
          Sound:
        </span>
        <div
          className="sound-control__modes"
          role="radiogroup"
          aria-labelledby="sound-mode-label"
        >
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              ref={(el) => {
                radioRefs.current[m.id] = el
              }}
              aria-checked={mode === m.id}
              tabIndex={mode === m.id ? 0 : -1}
              className={`sound-btn ${mode === m.id ? 'sound-btn--active' : ''}`}
              aria-label={`Sound: ${m.label}`}
              title={m.title}
              onClick={() => handleModeClick(m.id)}
              onKeyDown={onRadioKeyDown}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mounted && (
        <div
          className={`sound-control__volume ${shown ? 'sound-control__volume--in' : ''}`.trim()}
          aria-hidden={wantsSlider ? undefined : 'true'}
          inert={!wantsSlider}
        >
          <VolumeSlider value={Math.round(volume * 100)} onChange={handleVolumeChange} />
        </div>
      )}
    </div>
  )
}
