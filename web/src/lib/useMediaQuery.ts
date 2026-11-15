import { useEffect, useState } from 'react'

/** Live `matchMedia` result; false where matchMedia is unavailable (tests). */
export function useMediaQuery(query: string): boolean {
  const mq = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)
  const [matches, setMatches] = useState(() => mq()?.matches ?? false)
  useEffect(() => {
    const m = mq()
    if (!m) return
    const on = () => setMatches(m.matches)
    on()
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])
  return matches
}
