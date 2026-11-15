import { useId, useMemo, useState } from 'react'
import { sampleAt } from '../../lib/ephem'
import type { SkyPosition } from '../../lib/ephem'
import type { SiteBundle } from '../../lib/types'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { EarthDisc, SunDisc } from './Discs'
import { earthPhaseView, stripRotationDeg } from './earthDisc'
import { azDiff, describeBody, fmtNum, pickMask } from './geometry'
import {
  LOUPE_PX_PER_DEG,
  LOUPE_SIZE,
  inLoupeWindow,
  loupeTerrainPath,
  loupeX,
  loupeY,
} from './panoramaGeometry'
import './sky.css'

type Target = 'sun' | 'earth'

const NAME: Record<Target, string> = { sun: 'Sun', earth: 'Earth' }

function placeOf(pos: SkyPosition, centerAz: number) {
  const off = azDiff(centerAz, pos.az)
  return { off, inside: inLoupeWindow(off, pos.el) }
}

function LoupeFrame({ bundle, heightM, cursorMs, target }: {
  bundle: SiteBundle
  heightM: number
  cursorMs: number
  target: Target
}) {
  const clipId = 'loupe-clip-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const mask = useMemo(() => pickMask(bundle, heightM), [bundle, heightM])
  const sample = sampleAt(bundle.ephem, cursorMs)
  const azStep = bundle.horizon.az_step_deg
  // The silhouette is rebuilt only when the centre moves by 0.025 deg (at most half a pixel off).
  const centerAz = sample ? Math.round(sample[target].az / 0.025) * 0.025 : 0
  const terrain = useMemo(() => loupeTerrainPath(mask, azStep, centerAz), [mask, azStep, centerAz])

  if (!sample) {
    return <div className="loupe__box">Outside data range</div>
  }

  const focus = sample[target]
  const angR = target === 'sun' ? bundle.ephem.sun_ang_radius_deg : bundle.ephem.earth_ang_radius_deg
  const body = describeBody(focus, mask, azStep, angR)
  const sunPlace = placeOf(sample.sun, focus.az)
  const earthPlace = placeOf(sample.earth, focus.az)
  const phase = earthPhaseView(sample)
  const focusPlace = target === 'sun' ? sunPlace : earthPlace
  const caption = focusPlace.inside
    ? `${NAME[target]} disc visible ${fmtNum(body.fraction * 100, 0)} %`
    : `${NAME[target]} is outside the magnified window (elevation ${fmtNum(focus.el, 1, true)} deg)`
  const label = `Loupe on the ${NAME[target]}, ${bundle.site.name}. ${caption}.`

  return (
    <>
      <svg className="loupe__svg" viewBox={`0 0 ${LOUPE_SIZE} ${LOUPE_SIZE}`} role="img" aria-label={label}>
        <defs>
          <clipPath id={clipId}>
            <rect width={LOUPE_SIZE} height={LOUPE_SIZE} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect className="sky__bg" width={LOUPE_SIZE} height={LOUPE_SIZE} />
          {earthPlace.inside && (
            <EarthDisc
              cx={loupeX(earthPlace.off)}
              cy={loupeY(sample.earth.el)}
              trueRx={bundle.ephem.earth_ang_radius_deg * LOUPE_PX_PER_DEG}
              trueRy={bundle.ephem.earth_ang_radius_deg * LOUPE_PX_PER_DEG}
              minR={0}
              fraction={phase.fraction}
              rotationDeg={stripRotationDeg(phase)}
            />
          )}
          {sunPlace.inside && (
            <SunDisc
              cx={loupeX(sunPlace.off)}
              cy={loupeY(sample.sun.el)}
              trueRx={bundle.ephem.sun_ang_radius_deg * LOUPE_PX_PER_DEG}
              trueRy={bundle.ephem.sun_ang_radius_deg * LOUPE_PX_PER_DEG}
              minR={0}
            />
          )}
          <path className="sky__terrain" d={terrain.fill} />
          <path className="sky__horizon" d={terrain.edge} />
        </g>
        <rect className="sky__frame-line" width={LOUPE_SIZE} height={LOUPE_SIZE} />
      </svg>
      <div className="loupe__caption" title="Visible disc fraction; the horizon is treated as locally straight across the disc.">
        {caption}
      </div>
    </>
  )
}

function LoupeView({ scenario }: { scenario: Scenario }) {
  const { bundle } = useSiteBundle(scenario.siteId)
  const heightM = useAppStore((s) => s.observerHeightM)
  const cursorH = useAppStore((s) => s.cursorH)
  const [target, setTarget] = useState<Target>('sun')

  return (
    <div className="loupe" data-tour="loupe">
      <div className="loupe__tabs" role="group" aria-label="Loupe target">
        {(['sun', 'earth'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={target === t} onClick={() => setTarget(t)}>
            {NAME[t]}
          </button>
        ))}
      </div>
      {bundle ? (
        <LoupeFrame
          bundle={bundle}
          heightM={heightM}
          cursorMs={scenarioCursorMs(scenario, cursorH)}
          target={target}
        />
      ) : (
        <div className="loupe__box loupe__box--loading" aria-busy="true" aria-label="Loading loupe" />
      )}
      <div className="loupe__scale">Window: 6 deg wide, elevation −1 to +5 deg, true angular size</div>
    </div>
  )
}

export function Loupe({ scenarioId }: { scenarioId: string }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <LoupeView scenario={scenario} />
}
