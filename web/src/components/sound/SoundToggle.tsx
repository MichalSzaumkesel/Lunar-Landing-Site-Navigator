import { useEffect, useState, type ReactElement } from 'react'
import {
  getSoundEngine,
  loadSoundPreference,
  saveSoundPreference,
  type SoundEngine,
} from '../../lib/sound'

export interface SoundToggleProps {
  className?: string
  engine?: SoundEngine
}

/**
 * Toggle button for sound cues during playback.
 * Default off; persists state in localStorage; sets aria-pressed.
 */
export function SoundToggle({
  className = '',
  engine: customEngine,
}: SoundToggleProps): ReactElement {
  const engine = customEngine ?? getSoundEngine()
  const [enabled, setEnabled] = useState(() => {
    return engine.isEnabled() || loadSoundPreference()
  })

  // Sync with sound engine events
  useEffect(() => {
    const unsubscribe = engine.addListener((state) => {
      setEnabled(state)
    })
    return unsubscribe
  }, [engine])

  // If user previously turned sound on, activate on the first user interaction
  useEffect(() => {
    if (loadSoundPreference() && !engine.isEnabled() && typeof window !== 'undefined') {
      const onFirstGesture = (): void => {
        engine.enable()
      }
      window.addEventListener('pointerdown', onFirstGesture, { once: true })
      window.addEventListener('keydown', onFirstGesture, { once: true })
      return () => {
        window.removeEventListener('pointerdown', onFirstGesture)
        window.removeEventListener('keydown', onFirstGesture)
      }
    }
  }, [engine])

  const handleToggle = (): void => {
    if (engine.isEnabled()) {
      engine.disable()
      saveSoundPreference(false)
      setEnabled(false)
    } else {
      engine.enable()
      saveSoundPreference(true)
      setEnabled(true)
    }
  }

  return (
    <button
      type="button"
      className={className}
      aria-pressed={enabled}
      data-state={enabled ? 'on' : 'off'}
      title="Short tones when the Sun or Earth rises or sets during Play"
      onClick={handleToggle}
    >
      <span aria-hidden="true" className="sound-mark" />
      {enabled ? 'Sound on' : 'Sound off'}
    </button>
  )
}
