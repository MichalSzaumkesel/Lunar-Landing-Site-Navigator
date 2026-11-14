import { describe, expect, it } from 'vitest'
import {
  formatCoordDisplay,
  round1,
  validateCoordInputs,
  validateLatitude,
  validateLongitude,
} from './coords'

describe('coords', () => {
  describe('validateLatitude', () => {
    it('accepts valid latitudes in [-90, 90]', () => {
      expect(validateLatitude('0')).toEqual({ valid: true, value: 0 })
      expect(validateLatitude('-0')).toEqual({ valid: true, value: 0 })
      expect(validateLatitude('90')).toEqual({ valid: true, value: 90 })
      expect(validateLatitude('-90')).toEqual({ valid: true, value: -90 })
      expect(validateLatitude('-89.5')).toEqual({ valid: true, value: -89.5 })
      expect(validateLatitude('  45.123  ')).toEqual({ valid: true, value: 45.123 })
    })

    it('rejects out of range latitudes with spec message', () => {
      const high = validateLatitude('90.1')
      expect(high).toEqual({
        valid: false,
        error: 'Latitude must be between -90 and 90.',
      })

      const low = validateLatitude('-90.001')
      expect(low).toEqual({
        valid: false,
        error: 'Latitude must be between -90 and 90.',
      })
    })

    it('rejects invalid numbers and empty strings', () => {
      expect(validateLatitude('')).toEqual({
        valid: false,
        error: 'Latitude is required.',
      })
      expect(validateLatitude('abc')).toEqual({
        valid: false,
        error: 'Latitude must be a valid number.',
      })
      expect(validateLatitude('Infinity')).toEqual({
        valid: false,
        error: 'Latitude must be a valid number.',
      })
    })
  })

  describe('validateLongitude', () => {
    it('accepts valid longitudes in [-180, 180]', () => {
      expect(validateLongitude('0')).toEqual({ valid: true, value: 0 })
      expect(validateLongitude('180')).toEqual({ valid: true, value: 180 })
      expect(validateLongitude('-180')).toEqual({ valid: true, value: -180 })
      expect(validateLongitude('45.0')).toEqual({ valid: true, value: 45 })
      expect(validateLongitude(' -123.45 ')).toEqual({ valid: true, value: -123.45 })
    })

    it('rejects out of range longitudes with clear message', () => {
      expect(validateLongitude('180.1')).toEqual({
        valid: false,
        error: 'Longitude must be between -180 and 180.',
      })
      expect(validateLongitude('-180.5')).toEqual({
        valid: false,
        error: 'Longitude must be between -180 and 180.',
      })
    })

    it('rejects invalid numbers and empty strings', () => {
      expect(validateLongitude('')).toEqual({
        valid: false,
        error: 'Longitude is required.',
      })
      expect(validateLongitude('foo')).toEqual({
        valid: false,
        error: 'Longitude must be a valid number.',
      })
    })
  })

  describe('validateCoordInputs', () => {
    it('returns coordinates when both latitude and longitude are valid', () => {
      const res = validateCoordInputs('-89.5', '45.0')
      expect(res).toEqual({
        valid: true,
        lat: -89.5,
        lon: 45.0,
      })
    })

    it('returns error when latitude is invalid', () => {
      const res = validateCoordInputs('95', '0')
      expect(res.valid).toBe(false)
      expect(res.error).toBe('Latitude must be between -90 and 90.')
    })

    it('returns error when longitude is invalid', () => {
      const res = validateCoordInputs('0', '200')
      expect(res.valid).toBe(false)
      expect(res.error).toBe('Longitude must be between -180 and 180.')
    })
  })

  describe('formatCoordDisplay', () => {
    it('formats coordinates with 2 decimals and directional indicators', () => {
      expect(formatCoordDisplay(0, 0)).toBe('0.00°N, 0.00°E')
      expect(formatCoordDisplay(-89.5, 45)).toBe('89.50°S, 45.00°E')
      expect(formatCoordDisplay(12.345, -78.901)).toBe('12.35°N, 78.90°W')
      expect(formatCoordDisplay(-0, -0)).toBe('0.00°N, 0.00°E')
    })
  })

  describe('round1', () => {
    it('rounds numbers to 1 decimal place', () => {
      expect(round1(12.34)).toBe(12.3)
      expect(round1(-89.54)).toBe(-89.5)
      expect(round1(-89.56)).toBe(-89.6)
      expect(round1(-0.01)).toBe(0)
    })
  })
})
