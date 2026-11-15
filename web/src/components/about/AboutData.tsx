import { useCallback, useEffect, useRef, useState } from 'react'
import type { MetaInput } from '../../lib/types'
import { HORIZONS_QUERY_MISSING, horizonsQueryText } from '../../lib/horizonsQuery'
import { horizonUncertaintyDeg } from '../../lib/horizonUncertainty'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useSiteBundle } from '../../lib/useSiteBundle'
import type { PresenceState } from '../../lib/usePresence'
import { useAppStore } from '../../state/store'
import { copyHorizonsQuery } from '../share/shareActions'
import { REPO_DOCS_URL, checkLabel, summariseValidation } from './validationSummary'
import type { ValidationSummary } from './validationSummary'
import './about.css'

type State =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; summary: ValidationSummary }

function useValidation(): State {
  const [state, setState] = useState<State>({ status: 'loading' })
  useEffect(() => {
    const ctrl = new AbortController()
    const base = import.meta.env?.BASE_URL ?? '/'
    fetch(`${base}data/validation.json`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const summary = summariseValidation(json)
        setState(summary ? { status: 'ready', summary } : { status: 'missing' })
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ status: 'missing' })
      })
    return () => ctrl.abort()
  }, [])
  return state
}

function Provenance() {
  const siteId = useAppStore((s) => (s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0])?.siteId)
  const { bundle } = useSiteBundle(siteId ?? 'southpole_landed')
  if (!bundle || bundle.synthetic) return null
  const inputs: MetaInput[] = [...bundle.horizon.meta.inputs, ...bundle.ephem.meta.inputs]
  const seen = new Set<string>()
  const rows = inputs.filter((i) => i.url && !seen.has(i.url) && seen.add(i.url))
  if (rows.length === 0) return null
  return (
    <section>
      <h3>Where the data come from</h3>
      <ul className="about__list">
        {rows.map((i) => (
          <li key={i.url}>
            <a href={i.url} target="_blank" rel="noreferrer">{i.name}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function HorizonsQuery() {
  const siteId = useAppStore((s) => (s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0])?.siteId)
  const { bundle } = useSiteBundle(siteId ?? 'southpole_landed')
  const [note, setNote] = useState<string | null>(null)
  const [fallback, setFallback] = useState<string | null>(null)
  const available = horizonsQueryText(bundle?.ephem) !== null
  const onCopy = useCallback(async () => {
    setFallback(null)
    try {
      const r = await copyHorizonsQuery(siteId ?? 'southpole_landed')
      if (r.status === 'copied') setNote('Copied')
      else if (r.status === 'missing') setNote(HORIZONS_QUERY_MISSING)
      else {
        setNote('Could not copy. Copy the text from the box.')
        setFallback(r.text)
      }
    } catch {
      setNote('Could not copy.')
    }
  }, [siteId])
  if (!bundle) return null
  return (
    <section>
      <h3>Reproduce in JPL Horizons</h3>
      <p>
        The ephemeris file of {bundle.site.name} records the JPL Horizons query that produced the Sun and Earth positions.
      </p>
      <p>
        <button type="button" className="about__copy" disabled={!available} title={available ? undefined : HORIZONS_QUERY_MISSING} onClick={onCopy}>
          Copy Horizons query
        </button>{' '}
        <span role="status" aria-live="polite">{available ? note : HORIZONS_QUERY_MISSING}</span>
      </p>
      {fallback && (
        <input
          type="text"
          readOnly
          value={fallback}
          aria-label="Horizons query fallback"
          style={{ width: '100%' }}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </section>
  )
}

function HorizonUncertaintyNote() {
  const siteId = useAppStore((s) => (s.scenarios.find((x) => x.id === s.activeScenarioId) ?? s.scenarios[0])?.siteId)
  const { bundle } = useSiteBundle(siteId ?? 'southpole_landed')
  const u = bundle ? horizonUncertaintyDeg(bundle.horizon) : null
  if (u === null) return null
  return (
    <p>
      The horizon of {bundle?.site.name} carries an uncertainty of ±{u}° (the worst RMS of our own horizon computation
      under DEM degradation and site shifts). Ranges next to Sun visible and Earth in view show the share with the horizon
      raised and lowered by that amount. It excludes LOLA height and geolocation error.
    </p>
  )
}

export default function AboutData({ onClose, state = 'open' }: { onClose: () => void; state?: PresenceState }) {
  const validation = useValidation()
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(dialogRef, true)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="about__backdrop presence-fade" data-state={state} onClick={onClose}>
      <div
        ref={dialogRef}
        className="about presence-rise"
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="about__header">
          <h2 id="about-title">About the data</h2>
          <button ref={closeRef} type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>
        <p>
          Local horizons are computed from NASA LOLA terrain. Sun and Earth positions come from JPL Horizons.
          The tool shows geometry only.
        </p>
        <Provenance />
        <HorizonUncertaintyNote />
        <HorizonsQuery />
        <section>
          <h3>Validation</h3>
          {validation.status === 'loading' && <p aria-busy="true">Loading validation results...</p>}
          {validation.status === 'missing' && <p role="status">Validation results are not available in this build.</p>}
          {validation.status === 'ready' && (
            <>
              <p className="about__count">
                {validation.summary.passed} of {validation.summary.total} checks pass.
              </p>
              {validation.summary.groups.map((g) => (
                <details key={g.kind} className="about__group">
                  <summary>
                    {g.title} ({g.passed}/{g.checks.length})
                  </summary>
                  <ul className="about__list">
                    {g.checks.map((c) => (
                      <li key={c.id} title={c.notes}>
                        <span aria-hidden="true">{c.pass ? '✓' : '✗'}</span>{' '}
                        <span className="about__sr">{c.pass ? 'Pass' : 'Fail'}: </span>
                        {checkLabel(c.id)}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </>
          )}
        </section>
        <section>
          <h3>Method and sources</h3>
          <ul className="about__list">
            <li><a href={`${REPO_DOCS_URL}/method.md`} target="_blank" rel="noreferrer">Method</a></li>
            <li><a href={`${REPO_DOCS_URL}/sources.md`} target="_blank" rel="noreferrer">Sources</a></li>
          </ul>
        </section>
      </div>
    </div>
  )
}
