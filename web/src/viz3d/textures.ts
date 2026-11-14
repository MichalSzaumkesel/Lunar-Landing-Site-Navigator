import * as THREE from 'three'
import { mulberry32, tileFbm } from './noise'

// Procedural textures, generated into typed arrays at startup (no canvas, no downloads).

function dataTexture(data: Uint8Array, w: number, h: number, srgb: boolean): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType)
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

/** Gradient values are stored as 0.5 + g / GRADIENT_RANGE / 2 after scaling to unit rms. */
export const GRADIENT_RANGE = 4

/**
 * Tileable regolith detail. R, G: slope of a height field (d/du, d/dv, unit rms; slopes survive 8-bit
 * storage, heights would show contour bands), B: brightness variation, A: warm to cool tint variation.
 * The height field is broad noise, grain and small craters. Sampled triplanar in world space.
 */
export function makeRegolithTexture(size: number, anisotropy: number): THREE.DataTexture {
  const height = new Float32Array(size * size)
  const bright = new Float32Array(size * size)
  const tint = new Float32Array(size * size)
  const grain = mulberry32(5)
  // Brightness and tint are broad, so they are computed on a quarter-size grid and upsampled.
  const coarse = Math.max(16, size >> 2)
  const cb = new Float32Array(coarse * coarse)
  const ct = new Float32Array(coarse * coarse)
  for (let y = 0; y < coarse; y++) {
    for (let x = 0; x < coarse; x++) {
      cb[y * coarse + x] = tileFbm(x / coarse, y / coarse, 5, 4, 31)
      ct[y * coarse + x] = tileFbm(x / coarse, y / coarse, 3, 3, 53)
    }
  }
  const sample = (a: Float32Array, u: number, v: number) => {
    const fx = u * coarse
    const fy = v * coarse
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const x1 = (x0 + 1) % coarse
    const y1 = (y0 + 1) % coarse
    const top = a[y0 * coarse + x0] * (1 - tx) + a[y0 * coarse + x1] * tx
    const bottom = a[y1 * coarse + x0] * (1 - tx) + a[y1 * coarse + x1] * tx
    return top * (1 - ty) + bottom * ty
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const i = y * size + x
      height[i] = 0.55 * tileFbm(u, v, 6, 5, 1) + 0.3 * tileFbm(u, v, 24, 3, 7) + 0.06 * grain()
      bright[i] = sample(cb, u, v)
      tint[i] = sample(ct, u, v)
    }
  }

  // Small craters: a bowl with a raised rim, stamped with wrap-around so the texture still tiles.
  const rnd = mulberry32(77)
  const craterCount = Math.round((size * size) / 5000)
  for (let c = 0; c < craterCount; c++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const r = (0.012 + 0.05 * rnd() * rnd()) * size
    const depth = 0.35 + 0.3 * rnd()
    const reach = Math.ceil(r * 1.6)
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy) / r
        if (d > 1.6) continue
        const bowl = d < 1 ? -(1 - d * d) * depth : 0
        const rim = Math.exp(-(((d - 1.05) / 0.22) ** 2)) * depth * 0.45
        const px = (((Math.round(cx) + dx) % size) + size) % size
        const py = (((Math.round(cy) + dy) % size) + size) % size
        const i = py * size + px
        height[i] += (bowl + rim) * 0.5
        bright[i] += rim * 0.25 + bowl * 0.18
      }
    }
  }

  // Periodic central differences, then normalise to unit rms.
  const gu = new Float32Array(size * size)
  const gv = new Float32Array(size * size)
  let sum2 = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const xp = y * size + ((x + 1) % size)
      const xm = y * size + ((x + size - 1) % size)
      const yp = ((y + 1) % size) * size + x
      const ym = ((y + size - 1) % size) * size + x
      gu[i] = (height[xp] - height[xm]) * 0.5 * size
      gv[i] = (height[yp] - height[ym]) * 0.5 * size
      sum2 += gu[i] * gu[i] + gv[i] * gv[i]
    }
  }
  const inv = 1 / Math.sqrt(sum2 / (2 * size * size) || 1)
  const enc = (g: number) => Math.round(clamp01(0.5 + (g * inv) / GRADIENT_RANGE / 2) * 255)

  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = enc(gu[i])
    data[i * 4 + 1] = enc(gv[i])
    data[i * 4 + 2] = Math.round(clamp01(bright[i]) * 255)
    data[i * 4 + 3] = Math.round(clamp01(tint[i]) * 255)
  }
  const tex = dataTexture(data, size, size, false)
  tex.anisotropy = anisotropy
  return tex
}

/** Crinkled-foil height map (creases and wrinkles), tileable. */
export function makeCrinkleTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const ridge = 1 - Math.abs(2 * tileFbm(u, v, 6, 4, 9) - 1)
      const fine = tileFbm(u, v, 18, 3, 19)
      const h = clamp01(0.65 * ridge * ridge + 0.35 * fine)
      const o = (y * size + x) * 4
      data[o] = data[o + 1] = data[o + 2] = Math.round(h * 255)
      data[o + 3] = 255
    }
  }
  return dataTexture(data, size, size, false)
}

/**
 * Faint Milky Way band on an equirectangular map. Decorative, not the real sky: the band, its dust
 * lanes and its brighter core are procedural noise.
 */
export function makeMilkyWayTexture(w: number, h: number): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const v = y / h
    const lat = (v - 0.5) * Math.PI
    const band = Math.exp(-((lat / 0.2) ** 2))
    for (let x = 0; x < w; x++) {
      const u = x / w
      const core = 0.55 + 0.45 * Math.cos((u - 0.5) * Math.PI * 2)
      const cloud = tileFbm(u, v, 8, 5, 3)
      const lane = clamp01((tileFbm(u, v, 14, 4, 41) - 0.5) * 4)
      const i = band * (0.25 + 0.95 * cloud) * (1 - 0.8 * lane * band) * (0.45 + 0.75 * core)
      const warm = core * 0.6
      const o = (y * w + x) * 4
      data[o] = Math.round(clamp01(i * (0.55 + 0.45 * warm) * 0.3) * 255)
      data[o + 1] = Math.round(clamp01(i * (0.6 + 0.3 * warm) * 0.3) * 255)
      data[o + 2] = Math.round(clamp01(i * (0.8 - 0.2 * warm) * 0.32) * 255)
      data[o + 3] = 255
    }
  }
  const tex = dataTexture(data, w, h, true)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

export interface StarData {
  /** Unit directions, three.js axes, upper hemisphere (y >= -0.1). */
  positions: Float32Array
  /** Linear colour times brightness. */
  colors: Float32Array
  /** Point size in CSS pixels. */
  sizes: Float32Array
  magnitudes: Float32Array
}

const STAR_CLASSES: readonly (readonly [number, number, number])[] = [
  [0.65, 0.78, 1.0],
  [1.0, 0.98, 0.95],
  [1.0, 0.92, 0.75],
  [1.0, 0.78, 0.55],
  [1.0, 0.62, 0.45],
]
const STAR_CLASS_CUTS = [0.15, 0.55, 0.8, 0.95]

/**
 * Procedural stars: magnitude from a steep power law (many faint, few bright), size and brightness
 * follow the magnitude, colour a rough temperature class. Positions are invented, not a catalogue.
 */
export function buildStarData(count: number, seed = 20261114): StarData {
  const rnd = mulberry32(seed)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const magnitudes = new Float32Array(count)
  const m0 = -0.5
  const m1 = 6.5
  const lo = Math.pow(10, 0.45 * m0)
  const hi = Math.pow(10, 0.45 * m1)
  for (let i = 0; i < count; i++) {
    const y = rnd() * 1.1 - 0.1
    const phi = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    positions[i * 3] = Math.cos(phi) * r
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = Math.sin(phi) * r
    const m = Math.log10(lo + rnd() * (hi - lo)) / 0.45
    magnitudes[i] = m
    const b = 0.12 + 0.88 * Math.pow(10, -0.25 * (m + 0.5))
    const t = rnd()
    let cls = 0
    while (cls < STAR_CLASS_CUTS.length && t >= STAR_CLASS_CUTS[cls]) cls++
    const c = STAR_CLASSES[cls]
    colors[i * 3] = c[0] * b
    colors[i * 3 + 1] = c[1] * b
    colors[i * 3 + 2] = c[2] * b
    sizes[i] = 1.1 + 2.4 * Math.pow(b, 0.6)
  }
  return { positions, colors, sizes, magnitudes }
}
