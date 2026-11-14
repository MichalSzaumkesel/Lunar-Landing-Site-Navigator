import type { FC } from 'react'
import './badges.css'

export interface DataBadgesProps {
  synthetic?: boolean
  approximate?: boolean
  /** Site notes; shown as the tooltip of the Approximate badge when present. */
  notes?: string
}

export const DataBadges: FC<DataBadgesProps> = ({ synthetic, approximate, notes }) => {
  if (!synthetic && !approximate) {
    return null
  }

  return (
    <span className="data-badges">
      {synthetic && (
        <span
          className="badge badge--synthetic"
          title="Fake data for interface development, not a measurement."
        >
          Synthetic data
        </span>
      )}
      {approximate && (
        <span
          className="badge badge--approximate"
          title={notes || 'Real-based data with a known simplification (see the data notes).'}
        >
          Approximate
        </span>
      )}
    </span>
  )
}

export default DataBadges
