import { useEffect, useState, type ReactElement } from 'react'
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
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'off'}
            className={`sound-btn ${mode === 'off' ? 'sound-btn--active' : ''}`}
            aria-label="Sound: Off"
            title="Turn sound off"
            onClick={() => handleModeClick('off')}
          >
            Off
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'ambient'}
            className={`sound-btn ${mode === 'ambient' ? 'sound-btn--active' : ''}`}
            aria-label="Sound: Ambient"
            title="Calm ambient tone that follows Sun and Earth visibility"
            onClick={() => handleModeClick('ambient')}
          >
            Ambient
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'cues'}
            className={`sound-btn ${mode === 'cues' ? 'sound-btn--active' : ''}`}
            aria-label="Sound: Cues"
            title="Short tones when the Sun or Earth rises or sets during Play"
            onClick={() => handleModeClick('cues')}
          >
            Cues
          </button>
        </div>

      </div>

      {/* Permanently reserved slot: the slider slides in here, so nothing below is covered and nothing moves */}
      <div className="sound-control__slot">
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
    </div>
  )
}
