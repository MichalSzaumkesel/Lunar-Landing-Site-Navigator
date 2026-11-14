import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../state/store'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { listSkyEvents } from '../../lib/events'
import { useSiteBundle } from '../../lib/useSiteBundle'
import {
  findEventsBetween,
  getSoundEngine,
  type SoundEngine,
} from '../../lib/sound'

/**
 * Watches playback and cues sound events (sunrise, sunset, earthrise, earthset)
 * for the active scenario.
 *
 * Mounted once. Subscribes to store changes without per-frame re-renders.
 * Skips cues when sound is disabled, paused, scrubbing, or when speed > 72 h/s.
 */
export function useEventSounds(customEngine?: SoundEngine): void {
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const scenarios = useAppStore((s) => s.scenarios)
  const observerHeightM = useAppStore((s) => s.observerHeightM)

  const activeScenario =
    scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0]
  const siteId = activeScenario?.siteId ?? ''
  const { bundle } = useSiteBundle(siteId)

  const rawWindow = activeScenario ? scenarioWindowMs(activeScenario) : null
  const startMs = rawWindow?.startMs ?? null
  const endMs = rawWindow?.endMs ?? null

  const windowMs = useMemo(() => {
    if (startMs === null || endMs === null) return null
    return { startMs, endMs }
  }, [startMs, endMs])

  // Compute sky events once per bundle, observer height, and window
  const skyEvents = useMemo(() => {
    if (!bundle || !windowMs) return []
    return listSkyEvents(
      bundle,
      observerHeightM,
      windowMs.startMs,
      windowMs.endMs,
    )
  }, [bundle, observerHeightM, windowMs])

  const eventsRef = useRef(skyEvents)
  const activeScenarioRef = useRef(activeScenario)

  useEffect(() => {
    eventsRef.current = skyEvents
  }, [skyEvents])

  useEffect(() => {
    activeScenarioRef.current = activeScenario
  }, [activeScenario])

  const prevCursorMsRef = useRef<number | null>(null)

  // Reset cursor history when the active scenario changes
  useEffect(() => {
    prevCursorMsRef.current = null
  }, [activeScenario?.id])

  useEffect(() => {
    const engine = customEngine ?? getSoundEngine()

    const unsubscribe = useAppStore.subscribe((state) => {
      const scenario = activeScenarioRef.current
      if (!scenario) return

      const currMs = scenarioCursorMs(scenario, state.cursorH)
      const prevMs = prevCursorMsRef.current
      prevCursorMsRef.current = currMs

      // Only evaluate cues while playing and sound is enabled
      if (!state.playing || !engine.isEnabled()) {
        return
      }

      // First tick after starting playback or seek: establish baseline without firing cues
      if (prevMs === null) {
        return
      }

      const events = eventsRef.current
      if (!events || events.length === 0) return

      const cues = findEventsBetween(
        events,
        prevMs,
        currMs,
        state.speedHPerSec,
        72,
        12,
      )

      for (const evt of cues) {
        engine.cue(evt.kind)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [customEngine])
}
