import { memo, useId, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { sampleAt } from '../../lib/ephem'
import type { SkySample } from '../../lib/ephem'
import type { SiteBundle } from '../../lib/types'
import { useSvgTextScale } from '../../lib/useSvgTextScale'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs, scenarioWindowMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { Scenario } from '../../state/types'
import { EarthDisc, SunDisc } from './Discs'
import { earthPhaseView, polarRotationDeg } from './earthDisc'
import {
  CENTER,
  MIN_DISC_R,
  RIM_R,
  RIM_MARKER_BELOW_DEG,
  VIEW_SIZE,
  buildSkyModel,
  degToPx,
  describeSky,
  earthStateText,
  fmtUtc,
  polarToXY,
  skyZoomLabel,
  sunStateText,
} from './geometry'
import type { BodyReadout, SkyModel, SkyReadout } from './geometry'
import './sky.css'

const CARDINALS = [
  { az: 0, label: 'N' },
  { az: 90, label: 'E' },
  { az: 180, label: 'S' },
  { az: 270, label: 'W' },
]

interface BaseProps {
  model: SkyModel
  clipId: string
}

// Static layers below the discs: sky, grid and tracks. Redrawn only when the model changes.
const SkyBase = memo(function SkyBase({ model, clipId }: BaseProps) {
  return (
    <g>
      <circle className="sky__bg" r={RIM_R} />
      {model.rings.map((ring) => (
        <circle key={ring.el} className="sky__ring" r={ring.r} />
      ))}
      <path className="sky__spokes" d={model.spokesPath} />
      <g clipPath={`url(#${clipId})`}>
        <path className="sky__track sky__track--earth" d={model.earthTrackPath} />
        <path className="sky__track sky__track--sun" d={model.sunTrackPath} />
      </g>
    </g>
  )
})

// Static layers above the discs: terrain (covers discs behind ridges), rim and labels.
const SkyTop = memo(function SkyTop({ model }: { model: SkyModel }) {
  return (
    <g>
      <path className="sky__terrain" d={model.terrainPath} fillRule="evenodd" />
      {model.bandPath && <path className="sky__band" d={model.bandPath} fillRule="evenodd" />}
      <path key={model.horizonPath} className="sky__horizon" d={model.horizonPath} />
      <circle className="sky__rim" r={RIM_R} />
      {model.rings.map((ring) => {
        const p = polarToXY(45, ring.el, model.zoomEl, RIM_R, 0, 0)
        return (
          <text key={ring.el} className="sky__ring-label" x={p.x + 4} y={p.y - 4}>
            {ring.el}°
          </text>
        )
      })}
      {CARDINALS.map(({ az, label }) => {
        const p = polarToXY(az, 0, 1, RIM_R + 26, 0, 0)
        return (
          <text key={label} className="sky__cardinal" x={p.x} y={p.y}>
            {label}
          </text>
        )
      })}
    </g>
  )
})

function RimMarker({ body, kind }: { body: BodyReadout; kind: 'sun' | 'earth' }) {
  if (body.el >= -RIM_MARKER_BELOW_DEG) return null
  const { x, y } = polarToXY(body.az, 0, 1, RIM_R, 0, 0)
  return <circle className={`sky__marker sky__marker--${kind}`} cx={x} cy={y} r={6} />
}

interface FrameProps {
  scenario: Scenario
  bundle: SiteBundle
  model: SkyModel
  sample: SkySample | null
  cursorMs: number
  /** When set, the zoom caption is rendered there (Advanced puts it under the loupe). */
  zoomSlot?: HTMLElement | null
}

function PolarDiscs({ readout, sample, bundle, zoomEl }: {
  readout: SkyReadout
  sample: SkySample
  bundle: SiteBundle
  zoomEl: number
}) {
  const { sun, earth } = readout
  const earthXY = earth.el < -RIM_MARKER_BELOW_DEG ? null : polarToXY(earth.az, earth.el, zoomEl, RIM_R, 0, 0)
  const sunXY = sun.el < -RIM_MARKER_BELOW_DEG ? null : polarToXY(sun.az, sun.el, zoomEl, RIM_R, 0, 0)
  const earthR = degToPx(bundle.ephem.earth_ang_radius_deg, zoomEl)
  const sunR = degToPx(bundle.ephem.sun_ang_radius_deg, zoomEl)
  const phase = earthPhaseView(sample)
  return (
    <>
      {earthXY && (
        <EarthDisc
          cx={earthXY.x}
          cy={earthXY.y}
          trueRx={earthR}
          trueRy={earthR}
          minR={MIN_DISC_R}
          fraction={phase.fraction}
          rotationDeg={polarRotationDeg(phase, earth.az)}
        />
      )}
      {sunXY && <SunDisc cx={sunXY.x} cy={sunXY.y} trueRx={sunR} trueRy={sunR} minR={MIN_DISC_R} />}
    </>
  )
}

function SkyFrame({ scenario, bundle, model, sample, cursorMs, zoomSlot }: FrameProps) {
  const textScaleRef = useSvgTextScale()
  const clipId = 'sky-clip-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const readout = sample ? describeSky(sample, model, bundle.ephem) : null
  const utc = fmtUtc(cursorMs)
  const label = readout
    ? `Sky plot, ${bundle.site.name}, ${utc}. ${sunStateText(readout.sun.visible)}. ${earthStateText(readout.earth.visible)}.`
    : `Sky plot, ${bundle.site.name}, ${utc}. Outside data range.`

  const zoomCaption = (
    <p
      className={`sky__zoom${model.zoomEl < 90 ? ' sky__zoom--zoomed' : ''}`}
      data-sky-zoom={model.zoomEl}
      title="Elevation in degrees: the rim is the horizon (0°), the centre is the value shown"
    >
      {skyZoomLabel(model.zoomEl)}
    </p>
  )

  return (
    <>
    <div className="sky__frame">
      <svg
        ref={textScaleRef}
        className="sky__svg svg-scaled"
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        role="img"
        aria-label={label}
        data-scenario={scenario.id}
      >
        <defs>
          <clipPath id={clipId}>
            <circle r={RIM_R} />
          </clipPath>
        </defs>
        <g transform={`translate(${CENTER} ${CENTER})`}>
          <SkyBase model={model} clipId={clipId} />
          {readout && sample && (
            <g clipPath={`url(#${clipId})`}>
              <PolarDiscs readout={readout} sample={sample} bundle={bundle} zoomEl={model.zoomEl} />
            </g>
          )}
          <SkyTop model={model} />
          {readout && (
            <>
              <RimMarker body={readout.earth} kind="earth" />
              <RimMarker body={readout.sun} kind="sun" />
            </>
          )}
          {!readout && (
            <g className="sky__outside">
              <rect x={-120} y={-22} width={240} height={44} rx={8} />
              <text y={1}>Outside data range</text>
            </g>
          )}
        </g>
      </svg>
    </div>
    {zoomSlot ? createPortal(zoomCaption, zoomSlot) : zoomCaption}
    </>
  )
}

function SkyPlotView({ scenario, zoomSlot }: { scenario: Scenario; zoomSlot?: HTMLElement | null }) {
  const { status, bundle, error } = useSiteBundle(scenario.siteId)
  const heightM = useAppStore((s) => s.observerHeightM)
  const cursorH = useAppStore((s) => s.cursorH)
  const { startMs, endMs } = scenarioWindowMs(scenario)

  // Tracks and terrain depend on the bundle, observer height and window, never on the cursor.
  const model = useMemo(
    () => (bundle ? buildSkyModel(bundle, heightM, startMs, endMs) : null),
    [bundle, heightM, startMs, endMs],
  )

  let body
  if (status === 'error') {
    body = (
      <div className="sky__frame sky__box sky__box--error" role="alert">
        {error ?? 'Failed to load site data'}
      </div>
    )
  } else if (status === 'loading' || !bundle || !model) {
    body = <div className="sky__frame sky__box sky__skeleton" aria-busy="true" aria-label="Loading sky plot" />
  } else {
    const cursorMs = scenarioCursorMs(scenario, cursorH)
    body = (
      <SkyFrame
        scenario={scenario}
        bundle={bundle}
        model={model}
        sample={sampleAt(bundle.ephem, cursorMs)}
        cursorMs={cursorMs}
        zoomSlot={zoomSlot}
      />
    )
  }

  return (
    <div className="sky">{body}</div>
  )
}

export function SkyPlot({ scenarioId, zoomSlot }: { scenarioId: string; zoomSlot?: HTMLElement | null }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <SkyPlotView scenario={scenario} zoomSlot={zoomSlot} />
}
