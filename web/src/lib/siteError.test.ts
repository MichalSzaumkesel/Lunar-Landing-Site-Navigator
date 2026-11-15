import { describe, expect, it } from 'vitest'
import { isUnknownSiteError, siteErrorText } from './siteError'

describe('siteError', () => {
  it('recognises the unknown-site loader error', () => {
    expect(isUnknownSiteError('Unknown site: bogus')).toBe(true)
    expect(isUnknownSiteError('Network down')).toBe(false)
    expect(isUnknownSiteError(null)).toBe(false)
  })
  it('hides the raw id', () => {
    expect(siteErrorText('Unknown site: bogus')).toBe('Unknown place. Choose a place from the list.')
    expect(siteErrorText('Network down')).toBe('Network down')
    expect(siteErrorText(null)).toBe('Failed to load site data')
  })
})
