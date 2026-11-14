import { useMemo } from 'react'
import { angularSeparationDeg } from '../../lib/earthPhase'
import { listEclipses } from '../../lib/eclipses'
import { ephemCoverage, sampleAt } from '../../lib/ephem'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { useThrottledCursorH } from '../../viz3d/useThrottledCursorH'
import { earthPhaseText, earthPhaseView } from './earthDisc'
import { describeSky, earthStateText, fmtNum, fmtUtc, pickMask, sunStateText } from './geometry'
import type { BodyReadout } from './geometry'
import { TIP } from './skyTips'
import './sky.css'

function BodyRow({ kind, state, tip, body, extra }: {
  kind: 'sun' | 'earth'
  state: string
  tip: string
  body: BodyReadout
  extra?: { text: string; tip: string }
}) {
  return (
    <div className="sky__body">
      <span className="sky__name" title={tip}>
        <span className={`sky__dot sky__dot--${kind}${body.visible ? ' sky__dot--on' : ''}`} aria-hidden="true" />
        <span className={body.visible ? `sky__state sky__state--${kind}` : 'sky__state'}>{state}</span>
        {extra && (
          <span className="sky__phase" title={extra.tip}>
            {extra.text}
          </span>
        )}
      </span>
      <span title={TIP.az}>
        Az <b>{fmtNum(body.az, 1)} deg</b>
      </span>
      <span title={TIP.el}>
        El <b>{fmtNum(body.el, 2, true)} deg</b>
      </span>
      <span title={TIP.clear}>
        Clearance <b>{fmtNum(body.clearance, 2, true)} deg</b>
      </span>
      <span title={TIP.frac}>
        Disc <b>{fmtNum(body.fraction * 100, 0)} %</b>
      </span>
    </div>
  )
}

function ReadoutView({ scenario }: { scenario: Scenario }) {
  const { status, bundle, error } = useSiteBundle(scenario.siteId)
  const heightM = useAppStore((s) => s.observerHeightM)
  const cursorH = useThrottledCursorH()
  const mask = useMemo(() => (bundle ? pickMask(bundle, heightM) : null), [bundle, heightM])

  const eclipses = useMemo(() => {
    if (!bundle) return []
    const { startMs, endMs } = ephemCoverage(bundle.ephem)
    return listEclipses(bundle.ephem, startMs, endMs + 1)
  }, [bundle])

  if (status === 'error') {
    return (
      <div className="readout sky__readout sky__box--error" role="alert">
        <span>{error ?? 'Failed to load site data'}</span>
        <button
          type="button"
          onClick={() => {
            window.location.reload()
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!bundle || !mask) {
    return <div className="readout sky__readout sky__readout--loading" aria-busy="true" />
  }
  const cursorMs = scenarioCursorMs(scenario, cursorH)
  const sample = sampleAt(bundle.ephem, cursorMs)
  const readout = sample ? describeSky(sample, { mask, azStepDeg: bundle.horizon.az_step_deg }, bundle.ephem) : null
  const phase = sample ? earthPhaseView(sample) : null

  const activeEclipse = eclipses.find((e) => cursorMs >= e.startMs && cursorMs < e.endMs)
  let eclipsePct = activeEclipse ? Math.round(activeEclipse.maxOverlapFraction * 100) : 0
  if (activeEclipse && sample) {
    const sep = angularSeparationDeg(sample.sun, sample.earth)
    const rSun = bundle.ephem.sun_ang_radius_deg
    const rEarth = bundle.ephem.earth_ang_radius_deg
    if (rSun > 0) {
      const instFrac = Math.max(0, Math.min(1, (rSun + rEarth - sep) / (2 * rSun)))
      if (instFrac > 0) {
        eclipsePct = Math.round(instFrac * 100)
      }
    }
  }

  return (
    <div className="readout sky__readout">
      <div className="sky__time">{fmtUtc(cursorMs)}</div>
      {activeEclipse && (
        <div className="sky__body" style={{ gridColumn: '1 / -1' }}>
          Earth in front of the Sun, {eclipsePct} % of the Sun covered
        </div>
      )}
      {readout ? (
        <>
          <BodyRow kind="sun" state={sunStateText(readout.sun.visible)} tip={TIP.sun} body={readout.sun} />
          <BodyRow
            kind="earth"
            state={earthStateText(readout.earth.visible)}
            tip={TIP.earth}
            body={readout.earth}
            extra={phase ? { text: earthPhaseText(phase), tip: TIP.phase } : undefined}
          />
        </>
      ) : (
        <div className="sky__body sky__body--empty">Outside data range</div>
      )}
    </div>
  )
}

export function SkyReadout({ scenarioId }: { scenarioId: string }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <ReadoutView scenario={scenario} />
}
