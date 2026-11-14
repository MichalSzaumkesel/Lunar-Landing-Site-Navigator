import { describe, expect, it } from 'vitest'
import { safeHttpsUrl } from './safeUrl'

describe('safeHttpsUrl', () => {
  it('returns normalized href for valid https URLs', () => {
    expect(safeHttpsUrl('https://example.com')).toBe('https://example.com/')
    expect(safeHttpsUrl('https://example.com/path?foo=bar#hash')).toBe(
      'https://example.com/path?foo=bar#hash',
    )
  })

  it('returns null for javascript URLs', () => {
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull()
  })

  it('returns null for data URLs', () => {
    expect(safeHttpsUrl('data:text/html,x')).toBeNull()
  })

  it('returns null for http URLs', () => {
    expect(safeHttpsUrl('http://x')).toBeNull()
  })

  it('returns null for garbage strings', () => {
    expect(safeHttpsUrl('garbage')).toBeNull()
    expect(safeHttpsUrl('not a url at all')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(safeHttpsUrl('')).toBeNull()
  })
})
