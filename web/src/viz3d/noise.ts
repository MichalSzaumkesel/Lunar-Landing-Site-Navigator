/** Small seeded PRNG (mulberry32) so procedural decoration is identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Integer lattice hash to [0, 1). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Value noise in 0..1 that tiles with the unit square: `period` lattice cells across u and v. */
export function tileNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period
  const y = v * period
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const xa = ((x0 % period) + period) % period
  const ya = ((y0 % period) + period) % period
  const xb = (xa + 1) % period
  const yb = (ya + 1) % period
  const a = hash2(xa, ya, seed)
  const b = hash2(xb, ya, seed)
  const c = hash2(xa, yb, seed)
  const d = hash2(xb, yb, seed)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** Fractal sum of tileNoise, normalised to 0..1 (each octave doubles the period, so it still tiles). */
export function tileFbm(u: number, v: number, period: number, octaves: number, seed: number): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let p = period
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileNoise(u, v, p, seed + o * 101)
    norm += amp
    amp *= 0.5
    p *= 2
  }
  return sum / norm
}
