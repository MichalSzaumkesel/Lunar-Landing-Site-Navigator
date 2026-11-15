import { useEffect, useState, type ReactElement } from 'react'
import { SegmentedToggle, type SegmentedOption } from '../ui/SegmentedToggle'
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

function SpeakerIcon({ muted = false }: { muted?: boolean }): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M2 6h2.5L8 3v10L4.5 10H2z" fill="currentColor" />
      {muted ? (
        <path d="M10.5 6l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M10.5 5.8a3.2 3.2 0 010 4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      )}
    </svg>
  )
}

const MODES: SegmentedOption<SoundMode>[] = [
  { id: 'off', label: 'Off', icon: <SpeakerIcon muted />, title: 'Turn sound off' },
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
        <SegmentedToggle
          className="sound-control__modes"
          ariaLabel="Sound"
          options={MODES}
          value={mode}
          onChange={handleModeClick}
          fit
        />
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
