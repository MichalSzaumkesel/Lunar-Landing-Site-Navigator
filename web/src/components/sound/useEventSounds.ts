import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../state/store'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { listSkyEvents } from '../../lib/events'
import { useSiteBundle } from '../../lib/useSiteBundle'
import {
  computeAmbientParams,
  findEventsBetween,
  getSoundEngine,
  shouldUpdateAmbient,
  type SoundEngine,
} from '../../lib/sound'

/**
 * Watches playback and time cursor to drive sound for the active scenario:
 * - Continuous calm ambient tone (Sun & Earth visibility) in Ambient mode.
 * - Event beeps (sunrise, sunset, earthrise, earthset) in Cues mode.
 *
 * Mounted once. Subscribes to store changes without per-frame re-renders.
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
  const bundleRef = useRef(bundle)
  const observerHeightRef = useRef(observerHeightM)

  useEffect(() => {
    eventsRef.current = skyEvents
  }, [skyEvents])

  useEffect(() => {
    activeScenarioRef.current = activeScenario
  }, [activeScenario])

  useEffect(() => {
    bundleRef.current = bundle
  }, [bundle])

  useEffect(() => {
    observerHeightRef.current = observerHeightM
  }, [observerHeightM])

  const prevCursorMsRef = useRef<number | null>(null)

  // Reset cursor history when the active scenario changes
  useEffect(() => {
    prevCursorMsRef.current = null
  }, [activeScenario?.id])

  useEffect(() => {
    const engine = customEngine ?? getSoundEngine()
    let lastAmbientUpdateMs = -Infinity

    const pushAmbientUpdate = (cursorMs: number): void => {
      if (engine.getMode() !== 'ambient') return
      const params = computeAmbientParams(
        bundleRef.current,
        observerHeightRef.current,
        cursorMs,
      )
      engine.updateAmbient(params)
    }

    // When mode switches to ambient, immediately push current state
    const unsubMode = engine.addListener((mode) => {
      if (mode === 'ambient') {
        const scenario = activeScenarioRef.current
        if (scenario) {
          const currMs = scenarioCursorMs(
            scenario,
            useAppStore.getState().cursorH,
          )
          pushAmbientUpdate(currMs)
        }
      }
    })

    const unsubscribeStore = useAppStore.subscribe((state) => {
      const scenario = activeScenarioRef.current
      if (!scenario) return

      const currMs = scenarioCursorMs(scenario, state.cursorH)
      const prevMs = prevCursorMsRef.current
      prevCursorMsRef.current = currMs

      // 1. Ambient mode: continuous sound updated on cursor move (play or scrub)
      if (engine.getMode() === 'ambient') {
        const now =
          typeof performance !== 'undefined' ? performance.now() : Date.now()
        if (shouldUpdateAmbient(now, lastAmbientUpdateMs)) {
          lastAmbientUpdateMs = now
          pushAmbientUpdate(currMs)
        }
      }

      // 2. Cues mode: short tones during playback
      if (engine.getMode() === 'cues' && state.playing) {
        if (prevMs === null) return
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
      }
    })

    // If already ambient on mount, push initial state
    if (engine.getMode() === 'ambient' && activeScenarioRef.current) {
      const currMs = scenarioCursorMs(
        activeScenarioRef.current,
        useAppStore.getState().cursorH,
      )
      pushAmbientUpdate(currMs)
    }

    return () => {
      unsubMode()
      unsubscribeStore()
    }
  }, [customEngine])

  // Also push ambient update when bundle or observer height finishes loading
  useEffect(() => {
    const engine = customEngine ?? getSoundEngine()
    if (engine.getMode() === 'ambient' && activeScenarioRef.current && bundle) {
      const currMs = scenarioCursorMs(
        activeScenarioRef.current,
        useAppStore.getState().cursorH,
      )
      const params = computeAmbientParams(
        bundle,
        observerHeightM,
        currMs,
      )
      engine.updateAmbient(params)
    }
  }, [bundle, observerHeightM, customEngine])
}
