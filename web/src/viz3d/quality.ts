export type QualityTier = 'high' | 'medium' | 'low'

export interface TierSettings {
  farShadowMap: number
  nearShadowMap: number
  /** Radius of the high-resolution shadow zone around the lander. */
  nearRadiusM: number
  smallRocks: number
  /** How many of the nearest small rocks cast shadows. */
  shadowRocks: number
  boulders: number
  craters: number
  detailTexSize: number
  stars: number
  milkyWay: readonly [number, number]
  anisotropy: number
  pixelRatioCap: number
  /** Horizontal glare streak on the Sun (the cheap stand-in for bloom). */
  glare: boolean
}

export const TIERS: Record<QualityTier, TierSettings> = {
  high: {
    farShadowMap: 2048,
    nearShadowMap: 2048,
    nearRadiusM: 300,
    smallRocks: 2200,
    shadowRocks: 600,
    boulders: 400,
    craters: 250,
    detailTexSize: 256,
    stars: 2600,
    milkyWay: [256, 128],
    anisotropy: 8,
    pixelRatioCap: 2,
    glare: true,
  },
  medium: {
    farShadowMap: 1024,
    nearShadowMap: 1024,
    nearRadiusM: 250,
    smallRocks: 1100,
    shadowRocks: 300,
    boulders: 220,
    craters: 120,
    detailTexSize: 256,
    stars: 1600,
    milkyWay: [128, 64],
    anisotropy: 4,
    pixelRatioCap: 1.5,
    glare: true,
  },
  low: {
    farShadowMap: 1024,
    nearShadowMap: 512,
    nearRadiusM: 160,
    smallRocks: 450,
    shadowRocks: 100,
    boulders: 100,
    craters: 50,
    detailTexSize: 128,
    stars: 900,
    milkyWay: [64, 32],
    anisotropy: 1,
    pixelRatioCap: 1,
    glare: false,
  },
}

/** Normal frames observed at start-up; the first ones pay for shader compilation. */
export const BENCHMARK_SKIP_FRAMES = 3
export const BENCHMARK_FRAMES = 10
export const MIN_BENCHMARK_FRAMES = 8
const HIGH_MAX_MS = 14
const MEDIUM_MAX_MS = 30

/** Reads `q=high|medium|low` from a query string or a hash fragment; null when absent. */
export function parseTierOverride(search: string, hash: string): QualityTier | null {
  const parts = [...search.replace(/^\?/, '').split('&'), ...hash.replace(/^#/, '').split('&')]
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key === 'q' && (value === 'high' || value === 'medium' || value === 'low')) return value
  }
  return null
}

export function medianMs(samples: readonly number[]): number {
  if (samples.length === 0) return 0
  const s = [...samples].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Tier from the median interval between normal animation frames (vsync gives about 16 ms). */
export function tierForIntervalMs(ms: number): QualityTier {
  if (ms > 33) return 'low'
  if (ms > 20) return 'medium'
  return 'high'
}

export function tierForFrameMs(ms: number): QualityTier {
  if (ms <= HIGH_MAX_MS) return 'high'
  if (ms <= MEDIUM_MAX_MS) return 'medium'
  return 'low'
}

/**
 * Tier from render times measured over the first seconds. An override always wins; with too few
 * samples the machine is too slow to have produced them, so we fall back to low.
 */
export function chooseTier(override: QualityTier | null, samples: readonly number[]): QualityTier {
  if (override) return override
  if (samples.length < MIN_BENCHMARK_FRAMES) return 'low'
  return tierForFrameMs(medianMs(samples))
}

const ORDER: Record<QualityTier, number> = { high: 2, medium: 1, low: 0 }

/** Auto-tiering only ever lowers quality. */
export function isLower(a: QualityTier, than: QualityTier): boolean {
  return ORDER[a] < ORDER[than]
}
