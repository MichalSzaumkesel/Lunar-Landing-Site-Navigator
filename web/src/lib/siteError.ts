/** True when the loader failed because the site id is not a known place (not a network problem). */
export function isUnknownSiteError(error: string | null | undefined): boolean {
  return typeof error === 'string' && /^Unknown site\b/.test(error)
}

/** Message shown in place of the raw loader error; never exposes the id from the link. */
export function siteErrorText(error: string | null | undefined): string {
  return isUnknownSiteError(error) ? 'Unknown place. Choose a place from the list.' : (error ?? 'Failed to load site data')
}
