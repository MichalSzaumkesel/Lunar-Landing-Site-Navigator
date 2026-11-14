import { memo, useId, useMemo } from 'react'
import { sampleAt } from '../../lib/ephem'
import type { SkySample } from '../../lib/ephem'
import type { SiteBundle } from '../../lib/types'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { EarthDisc, SunDisc } from './Discs'
import { earthPhaseView, stripRotationDeg } from './earthDisc'
import { describeSky, earthStateText, fmtNum, fmtUtc, sunStateText } from './geometry'
import {
  PANO_H,
  PANO_MIN_DISC_R,
  PANO_PAD_LEFT,
  PANO_PAD_TOP,
  PANO_VIEW_H,
  PANO_VIEW_W,
  PANO_W,
  azToX,
  buildPanoramaModel,
  elToY,
  isBelowStrip,
} from './panoramaGeometry'
import type { PanoramaModel } from './panoramaGeometry'
import './sky.css'

const AZ_LABELS = [
  { az: 0, label: 'N' },
  { az: 90, label: 'E' },
  { az: 180, label: 'S' },
  { az: 270, label: 'W' },
  { az: 360, label: 'N' },
]
const AZ_GRID = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360]

// Layers below the discs: sky, grid and tracks. Redrawn only when the model changes.
const PanoBase = memo(function PanoBase({ model, clipId }: { model: PanoramaModel; clipId: string }) {
  return (
    <g>
      <rect className="sky__bg" width={PANO_W} height={PANO_H} />
      {model.ticks.map((t) => (
        <line key={t.el} className="sky__grid" x1={0} x2={PANO_W} y1={t.y} y2={t.y} />
      ))}
      {AZ_GRID.map((az) => (
        <line key={az} className="sky__grid" x1={azToX(az)} x2={azToX(az)} y1={0} y2={PANO_H} />
      ))}
      <g clipPath={`url(#${clipId})`}>
        <path className="sky__track sky__track--earth" d={model.earthTrackPath} />
        <path className="sky__track sky__track--sun" d={model.sunTrackPath} />
      </g>
    </g>
  )
})

// Layers above the discs: terrain (covers discs behind ridges), frame and labels.
const PanoTop = memo(function PanoTop({ model }: { model: PanoramaModel }) {
  return (
    <g>
      <path className="sky__terrain" d={model.terrainPath} />
      <path key={model.horizonPath} className="sky__horizon" d={model.horizonPath} />
      <rect className="sky__frame-line" width={PANO_W} height={PANO_H} />
      {model.ticks.map((t) => (
        <text key={t.el} className="sky__pano-label sky__pano-label--y" x={-6} y={t.y}>
          {t.el}°
        </text>
      ))}
      <text className="sky__pano-label sky__pano-label--y" x={-6} y={PANO_H}>
        0°
      </text>
      {AZ_LABELS.map(({ az, label }, i) => (
        <text
          key={az}
          className="sky__pano-label sky__pano-label--x"
          x={azToX(az)}
          y={PANO_H + 20}
          textAnchor={i === 0 ? 'start' : i === AZ_LABELS.length - 1 ? 'end' : 'middle'}
        >
          {label}
        </text>
      ))}
    </g>
  )
})

function PanoDiscs({ sample, bundle, model, clipId, readout }: {
  sample: SkySample
  bundle: SiteBundle
  model: PanoramaModel
  clipId: string
  readout: ReturnType<typeof describeSky>
}) {
  const { sun, earth } = readout
  const phase = earthPhaseView(sample)
  const { xPerDeg, yPerDeg, zoomEl } = model
  const sunR = bundle.ephem.sun_ang_radius_deg
  const earthR = bundle.ephem.earth_ang_radius_deg
  return (
    <g clipPath={`url(#${clipId})`}>
      {!isBelowStrip(earth.el) && (
        <EarthDisc
          cx={azToX(earth.az)}
          cy={elToY(earth.el, zoomEl)}
          trueRx={earthR * xPerDeg}
          trueRy={earthR * yPerDeg}
          minR={PANO_MIN_DISC_R}
          fraction={phase.fraction}
          rotationDeg={stripRotationDeg(phase)}
        />
      )}
      {!isBelowStrip(sun.el) && (
        <SunDisc
          cx={azToX(sun.az)}
          cy={elToY(sun.el, zoomEl)}
          trueRx={sunR * xPerDeg}
          trueRy={sunR * yPerDeg}
          minR={PANO_MIN_DISC_R}
        />
      )}
    </g>
  )
}

function Markers({ readout, model }: { readout: ReturnType<typeof describeSky>; model: PanoramaModel }) {
  return (
    <>
      {isBelowStrip(readout.earth.el) && (
        <circle className="sky__marker sky__marker--earth" cx={azToX(readout.earth.az)} cy={PANO_H} r={6} />
      )}
      {isBelowStrip(readout.sun.el) && (
        <circle className="sky__marker sky__marker--sun" cx={azToX(readout.sun.az)} cy={PANO_H} r={6} />
      )}
      <text className="sky__scale" x={8} y={20}>
        scale 0 to {model.zoomEl} deg, vertical x{fmtNum(model.yPerDeg / model.xPerDeg, 0)}
      </text>
    </>
  )
}

function PanoramaFrame({ scenario, bundle, model, cursorMs }: {
  scenario: Scenario
  bundle: SiteBundle
  model: PanoramaModel
  cursorMs: number
}) {
  const clipId = 'pano-clip-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const sample = sampleAt(bundle.ephem, cursorMs)
  const readout = sample ? describeSky(sample, model, bundle.ephem) : null
  const utc = fmtUtc(cursorMs)
  const label = readout
    ? `Panorama, ${bundle.site.name}, ${utc}. ${sunStateText(readout.sun.visible)}. ${earthStateText(readout.earth.visible)}.`
    : `Panorama, ${bundle.site.name}, ${utc}. Outside data range.`

  return (
    <div className="sky__pano">
      <svg
        className="sky__svg"
        viewBox={`0 0 ${PANO_VIEW_W} ${PANO_VIEW_H}`}
        role="img"
        aria-label={label}
        data-scenario={scenario.id}
      >
        <defs>
          <clipPath id={clipId}>
            <rect width={PANO_W} height={PANO_H} />
          </clipPath>
        </defs>
        <g transform={`translate(${PANO_PAD_LEFT} ${PANO_PAD_TOP})`}>
          <PanoBase model={model} clipId={clipId} />
          {readout && sample && (
            <PanoDiscs sample={sample} bundle={bundle} model={model} clipId={clipId} readout={readout} />
          )}
          <PanoTop model={model} />
          {readout && <Markers readout={readout} model={model} />}
          {!readout && (
            <g className="sky__outside">
              <rect x={PANO_W / 2 - 120} y={PANO_H / 2 - 22} width={240} height={44} rx={8} />
              <text x={PANO_W / 2} y={PANO_H / 2 + 1}>
                Outside data range
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  )
}

function PanoramaView({ scenario }: { scenario: Scenario }) {
  const { status, bundle, error } = useSiteBundle(scenario.siteId)
  const heightM = useAppStore((s) => s.observerHeightM)
  const cursorH = useAppStore((s) => s.cursorH)
  const { startMs, endMs } = scenarioWindowMs(scenario)

  // Terrain and tracks never depend on the cursor.
  const model = useMemo(
    () => (bundle ? buildPanoramaModel(bundle, heightM, startMs, endMs) : null),
    [bundle, heightM, startMs, endMs],
  )

  if (status === 'error') {
    return (
      <div className="sky__pano sky__box sky__box--error" role="alert">
        {error ?? 'Failed to load site data'}
      </div>
    )
  }
  if (status === 'loading' || !bundle || !model) {
    return <div className="sky__pano sky__box sky__skeleton" aria-busy="true" aria-label="Loading panorama" />
  }
  return (
    <PanoramaFrame
      scenario={scenario}
      bundle={bundle}
      model={model}
      cursorMs={scenarioCursorMs(scenario, cursorH)}
    />
  )
}

export function Panorama({ scenarioId }: { scenarioId: string }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return (
    <div className="sky">
      <PanoramaView scenario={scenario} />
    </div>
  )
}
