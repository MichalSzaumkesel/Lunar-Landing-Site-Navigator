// Sun and Earth discs shared by the polar plot, the panorama and the loupe.
import { litPartPath } from './earthDisc'

interface DiscProps {
  cx: number
  cy: number
  /** True angular size in plot units, per axis (the panorama stretches the vertical axis). */
  trueRx: number
  trueRy: number
  /** Smallest drawn radius; below it a thin ring marks the true size. */
  minR: number
}

interface EarthProps extends DiscProps {
  fraction: number
  /** Screen rotation of the lit limb, degrees. */
  rotationDeg: number
}

function frame({ cx, cy, trueRx, trueRy, minR }: DiscProps) {
  const rx = Math.max(trueRx, minR)
  const ry = Math.max(trueRy, minR)
  return {
    transform: `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${rx.toFixed(2)} ${ry.toFixed(2)})`,
    // The ring marks the true size only when the disc is enlarged on both axes.
    ring: trueRx < minR && trueRy < minR ? { rx: trueRx / rx, ry: trueRy / ry } : null,
  }
}

function TrueRing({ ring }: { ring: { rx: number; ry: number } | null }) {
  if (!ring) return null
  return <ellipse className="sky__disc-ring" rx={ring.rx} ry={ring.ry} vectorEffect="non-scaling-stroke" />
}

export function SunDisc(props: DiscProps) {
  const { transform, ring } = frame(props)
  return (
    <g className="sky__disc sky__disc--sun" transform={transform}>
      <circle className="sky__disc-fill" r={1} vectorEffect="non-scaling-stroke" />
      <TrueRing ring={ring} />
    </g>
  )
}

/** Dark disc with the lit part towards the Sun. */
export function EarthDisc(props: EarthProps) {
  const { transform, ring } = frame(props)
  const lit = litPartPath(props.fraction)
  return (
    <g className="sky__disc sky__disc--earth" transform={transform}>
      <circle className="sky__earth-dark" r={1} />
      {lit && <path className="sky__earth-lit" d={lit} transform={`rotate(${props.rotationDeg.toFixed(1)})`} />}
      <circle className="sky__disc-edge" r={1} vectorEffect="non-scaling-stroke" />
      <TrueRing ring={ring} />
    </g>
  )
}
