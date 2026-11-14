/**
 * Validates and normalizes an HTTPS URL.
 * Parses the input with `new URL` inside try/catch and returns `url.href`
 * only when `protocol === 'https:'`, otherwise `null`.
 */
export function safeHttpsUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}
