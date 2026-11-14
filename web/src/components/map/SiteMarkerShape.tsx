import type { FC } from 'react'
import type { SiteCategory } from '../../lib/types'
import { renderMarkerGlyph, type MarkerGlyphProps } from './markerGlyphs'

export type { MarkerGlyphProps }

export const SiteMarkerGlyph: FC<MarkerGlyphProps> = (props) => {
  return renderMarkerGlyph(props)
}

/**
 * Standalone SVG shape icon for the map legend.
 */
export const LegendShape: FC<{ category: SiteCategory; color?: string }> = ({
  category,
  color,
}) => {
  const catColor = color ?? `var(--cat-${category})`
  return (
    <svg
      width={14}
      height={14}
      viewBox="-7 -7 14 14"
      className="map-legend__shape"
      aria-hidden="true"
    >
      {renderMarkerGlyph({
        category,
        cx: 0,
        cy: 0,
        color: catColor,
        isActive: true,
        className: undefined,
      })}
    </svg>
  )
}
