import { useMemo, type KeyboardEvent, type ReactElement } from 'react'
import {
  earthStatusText,
  formatElevationDeg,
  limitTableRows,
  sunStatusText,
  type ElevationPoint,
} from './elevationSeries'
import './chart.css'

export interface ElevationTableProps {
  series: ElevationPoint[]
  cursorH: number
  onSelectHour: (h: number) => void
  maxRows?: number
}

export function ElevationTable({
  series,
  cursorH,
  onSelectHour,
  maxRows = 200,
}: ElevationTableProps): ReactElement {
  const rows = useMemo(() => limitTableRows(series, maxRows), [series, maxRows])
  const isTruncated = series.length > maxRows

  const handleKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, relH: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelectHour(relH)
    }
  }

  return (
    <div
      className="elevation-table-container"
      tabIndex={0}
      role="region"
      aria-label="Elevation series data table"
    >
      <table className="elevation-table">
        <caption>Sun and Earth elevation above the horizon over time</caption>
        <thead>
          <tr>
            <th scope="col">Time (UTC)</th>
            <th scope="col">Hour</th>
            <th scope="col">Sun elevation above horizon</th>
            <th scope="col">Sun status</th>
            <th scope="col">Earth elevation above horizon</th>
            <th scope="col">Earth status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCursor = Math.abs(row.relH - cursorH) < 0.5
            return (
              <tr
                key={row.timeMs}
                className={isCursor ? 'is-cursor' : undefined}
                aria-current={isCursor ? 'time' : undefined}
                onClick={() => onSelectHour(row.relH)}
                onKeyDown={(e) => handleKeyDown(e, row.relH)}
                tabIndex={0}
                role="button"
                aria-label={`Jump to ${row.utcIso}: Sun ${formatElevationDeg(row.sunClearanceDeg)} (${sunStatusText(row.sunVisible)}), Earth ${formatElevationDeg(row.earthClearanceDeg)} (${earthStatusText(row.earthVisible)})`}
              >
                <th scope="row" className="elevation-table__mono">
                  {row.utcIso}
                </th>
                <td className="elevation-table__mono">+{Math.round(row.relH)} h</td>
                <td className="elevation-table__mono">
                  {formatElevationDeg(row.sunClearanceDeg)}
                </td>
                <td>
                  <span
                    className={`elevation-table__status ${
                      row.sunVisible
                        ? 'elevation-table__status--visible'
                        : 'elevation-table__status--hidden'
                    }`}
                  >
                    {sunStatusText(row.sunVisible)}
                  </span>
                </td>
                <td className="elevation-table__mono">
                  {formatElevationDeg(row.earthClearanceDeg)}
                </td>
                <td>
                  <span
                    className={`elevation-table__status ${
                      row.earthVisible
                        ? 'elevation-table__status--visible'
                        : 'elevation-table__status--hidden'
                    }`}
                  >
                    {earthStatusText(row.earthVisible)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {isTruncated && (
        <div className="elevation-table__caption-note" role="note">
          Showing 200 of {series.length} hourly rows. Use range buttons (24 h, 7 d) to focus on intervals.
        </div>
      )}
    </div>
  )
}
