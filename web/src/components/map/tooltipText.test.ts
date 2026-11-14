import { describe, expect, it } from 'vitest'
import { categoryLabel, formatLatLonHemi, statusLabel } from './tooltipText'

describe('marker tooltip text', () => {
  it('formats lat/lon with 2 decimals and hemisphere letters', () => {
    expect(formatLatLonHemi(-84.791, 29.196)).toBe('84.79°S, 29.20°E')
    expect(formatLatLonHemi(0.674, -23.473)).toBe('0.67°N, 23.47°W')
  })
  it('labels categories and statuses in plain words', () => {
    expect(categoryLabel('artemis_region')).toBe('Artemis candidate region')
    expect(statusLabel('candidate_region')).toBe('Candidate region')
    expect(statusLabel(null)).toBeNull()
  })
})
