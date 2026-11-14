import type { ReactElement } from 'react'
import type { SiteCategory } from '../../lib/types'

export interface MarkerGlyphProps {
  category: SiteCategory
  cx?: number
  cy?: number
  color: string
  isActive?: boolean
  className?: string
}

/**
 * Geometric shape per category (same size class: ~10 px):
 * - apollo: circle (r = 5)
 * - clps: square (width = 9, height = 9)
 * - commercial: diamond (11x11 diagonal)
 * - international: triangle (pointing up, height 9.5, base 10.4)
 * - artemis_region: hexagon (radius 5.5)
 * - custom: plus-in-circle (circle r = 5 with plus cross)
 *
 * Active site is filled; inactive site is outlined (with background fill for contrast).
 */
export function renderMarkerGlyph({
  category,
  cx = 0,
  cy = 0,
  color,
  isActive = false,
  className = 'map-marker__core',
}: MarkerGlyphProps): ReactElement {
  const fill = isActive ? color : 'var(--bg)'
  const stroke = isActive ? 'var(--focus)' : color
  const strokeWidth = 1.5

  switch (category) {
    case 'apollo':
      return (
        <circle
          cx={cx}
          cy={cy}
          r={5}
          className={className}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'clps':
      return (
        <rect
          x={cx - 4.5}
          y={cy - 4.5}
          width={9}
          height={9}
          rx={1}
          className={className}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'commercial':
      return (
        <polygon
          points={`${cx},${cy - 5.5} ${cx + 5.5},${cy} ${cx},${cy + 5.5} ${cx - 5.5},${cy}`}
          className={className}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'international':
      return (
        <polygon
          points={`${cx},${cy - 5.5} ${cx + 5.2},${cy + 4} ${cx - 5.2},${cy + 4}`}
          className={className}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'artemis_region':
      return (
        <polygon
          points={`${cx},${cy - 5.5} ${cx + 4.8},${cy - 2.75} ${cx + 4.8},${cy + 2.75} ${cx},${cy + 5.5} ${cx - 4.8},${cy + 2.75} ${cx - 4.8},${cy - 2.75}`}
          className={className}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'custom':
    default:
      return (
        <g className={className}>
          <circle
            cx={cx}
            cy={cy}
            r={5}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <line
            x1={cx - 3}
            y1={cy}
            x2={cx + 3}
            y2={cy}
            stroke={isActive ? 'var(--bg)' : color}
            strokeWidth={1.5}
          />
          <line
            x1={cx}
            y1={cy - 3}
            x2={cx}
            y2={cy + 3}
            stroke={isActive ? 'var(--bg)' : color}
            strokeWidth={1.5}
          />
        </g>
      )
  }
}
