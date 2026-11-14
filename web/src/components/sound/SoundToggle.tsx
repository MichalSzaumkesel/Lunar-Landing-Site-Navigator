import { useEffect, useState, type ReactElement } from 'react'
import {
  getSoundEngine,
  loadSoundPreference,
  saveSoundPreference,
  saveSoundVolume,
  type SoundEngine,
  type SoundMode,
} from '../../lib/sound'
import './sound.css'

export interface SoundToggleProps {
  className?: string
  engine?: SoundEngine
}

/**
 * Three-state sound control: Off / Ambient / Cues, with volume slider and visibility hint.
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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = Number(e.target.value) / 100
    setVolume(val)
    saveSoundVolume(val)
    engine.setVolume(val)
  }

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

        <div className="sound-control__volume">
          <label htmlFor="sound-volume-slider" className="sound-sr-only">
            Sound volume
          </label>
          <input
            id="sound-volume-slider"
            type="range"
            min="0"
            max="100"
            value={Math.round(volume * 100)}
            onChange={handleVolumeChange}
            aria-label="Sound volume"
            title={`Sound volume: ${Math.round(volume * 100)} %`}
            className="sound-volume-slider"
          />
        </div>
      </div>

      {mode === 'ambient' && (
        <div className="sound-control__hint" role="status">
          Sun and Earth fade in and out with visibility.
        </div>
      )}
    </div>
  )
}
