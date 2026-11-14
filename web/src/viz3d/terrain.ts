import type { TerrainFile } from '../lib/types'

/** Decode the .bin (uint16 little-endian, row-major) into heights in metres relative to the site (site at z = 0). */
export function decodeHeights(
  bin: ArrayBuffer,
  t: Pick<TerrainFile, 'size_px' | 'height_min_m' | 'height_max_m' | 'site_height_m'>,
): Float32Array {
  const count = t.size_px * t.size_px
  const expectedBytes = count * 2
  if (bin.byteLength !== expectedBytes) {
    throw new Error(
      `Invalid terrain bin size: expected ${expectedBytes} bytes (${t.size_px}x${t.size_px} uint16), got ${bin.byteLength}`,
    )
  }

  const out = new Float32Array(count)
  const view = new DataView(bin)
  const heightSpan = t.height_max_m - t.height_min_m
  const minM = t.height_min_m
  const siteM = t.site_height_m

  for (let i = 0; i < count; i++) {
    const v = view.getUint16(i * 2, true)
    out[i] = minM + (v / 65535) * heightSpan - siteM
  }

  return out
}

/** URL of the .bin for a loaded terrain file. Mock terrain (meta.synthetic) lives under data/mock/. */
export function terrainBinUrl(baseUrl: string, t: Pick<TerrainFile, 'bin' | 'meta'>): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const cleanBin = t.bin.replace(/^\/+/, '')
  const sub = t.meta.synthetic ? 'data/mock/' : 'data/'
  return `${base}${sub}${cleanBin}`
}

export interface TerrainMesh {
  positions: Float32Array // 3 floats per vertex (x, y, z) in ENU metres, z already multiplied by verticalExaggeration
  normals: Float32Array // 3 floats per vertex, unit length, computed after the exaggeration
  uvs: Float32Array // 2 floats per vertex in 0..1 (u west to east, v south to north)
  indices: Uint32Array // 3 per triangle, counter-clockwise when seen from above (+z)
  vertexCount: number
  triangleCount: number
  zMin: number // after exaggeration
  zMax: number
}

export function buildTerrainMesh(
  heights: Float32Array,
  sizePx: number,
  spacingM: number,
  verticalExaggeration: number = 1,
): TerrainMesh {
  const vertexCount = sizePx * sizePx
  if (heights.length !== vertexCount) {
    throw new Error(
      `heights length (${heights.length}) does not match sizePx*sizePx (${vertexCount})`,
    )
  }

  const triangleCount = sizePx >= 2 ? (sizePx - 1) * (sizePx - 1) * 2 : 0

  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices = new Uint32Array(triangleCount * 3)

  const halfSize = sizePx / 2
  const denomUv = sizePx > 1 ? sizePx - 1 : 1

  let zMin = Infinity
  let zMax = -Infinity

  for (let r = 0; r < sizePx; r++) {
    const y = (halfSize - r) * spacingM
    const v = 1 - r / denomUv
    const rowOffset = r * sizePx

    for (let c = 0; c < sizePx; c++) {
      const idx = rowOffset + c
      const x = (c - halfSize) * spacingM
      const u = c / denomUv
      const z = heights[idx] * verticalExaggeration

      if (z < zMin) zMin = z
      if (z > zMax) zMax = z

      const pOffset = idx * 3
      positions[pOffset] = x
      positions[pOffset + 1] = y
      positions[pOffset + 2] = z

      const uvOffset = idx * 2
      uvs[uvOffset] = u
      uvs[uvOffset + 1] = v
    }
  }

  if (vertexCount === 0) {
    zMin = 0
    zMax = 0
  }

  // Normals from central differences of exaggerated heights
  // x is East (+c), y is North (-r).
  // dfx = dz/dx; dfy = dz/dy.
  // Surface normal pointing in +z: (-dfx, -dfy, 1) normalized.
  for (let r = 0; r < sizePx; r++) {
    const rowOffset = r * sizePx

    for (let c = 0; c < sizePx; c++) {
      const idx = rowOffset + c
      const nOffset = idx * 3

      if (sizePx <= 1) {
        normals[nOffset] = 0
        normals[nOffset + 1] = 0
        normals[nOffset + 2] = 1
        continue
      }

      let dfx = 0
      if (c === 0) {
        const z0 = positions[idx * 3 + 2]
        const z1 = positions[(rowOffset + 1) * 3 + 2]
        dfx = (z1 - z0) / spacingM
      } else if (c === sizePx - 1) {
        const z0 = positions[(rowOffset + c - 1) * 3 + 2]
        const z1 = positions[idx * 3 + 2]
        dfx = (z1 - z0) / spacingM
      } else {
        const z0 = positions[(rowOffset + c - 1) * 3 + 2]
        const z1 = positions[(rowOffset + c + 1) * 3 + 2]
        dfx = (z1 - z0) / (2 * spacingM)
      }

      let dfy = 0
      if (r === 0) {
        const zNorth = positions[idx * 3 + 2]
        const zSouth = positions[(1 * sizePx + c) * 3 + 2]
        dfy = (zNorth - zSouth) / spacingM
      } else if (r === sizePx - 1) {
        const zNorth = positions[((sizePx - 2) * sizePx + c) * 3 + 2]
        const zSouth = positions[idx * 3 + 2]
        dfy = (zNorth - zSouth) / spacingM
      } else {
        const zNorth = positions[((r - 1) * sizePx + c) * 3 + 2]
        const zSouth = positions[((r + 1) * sizePx + c) * 3 + 2]
        dfy = (zNorth - zSouth) / (2 * spacingM)
      }

      const nx = -dfx
      const ny = -dfy
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      normals[nOffset] = nx * invLen
      normals[nOffset + 1] = ny * invLen
      normals[nOffset + 2] = 1 * invLen
    }
  }

  // Triangles: 2 per cell, counter-clockwise winding when seen from above (+z)
  let triIdx = 0
  for (let r = 0; r < sizePx - 1; r++) {
    const rowOffset = r * sizePx
    const nextRowOffset = (r + 1) * sizePx
    for (let c = 0; c < sizePx - 1; c++) {
      const i00 = rowOffset + c
      const i01 = i00 + 1
      const i10 = nextRowOffset + c
      const i11 = i10 + 1

      // Triangle 1: i00 (NW), i10 (SW), i11 (SE)
      indices[triIdx++] = i00
      indices[triIdx++] = i10
      indices[triIdx++] = i11

      // Triangle 2: i00 (NW), i11 (SE), i01 (NE)
      indices[triIdx++] = i00
      indices[triIdx++] = i11
      indices[triIdx++] = i01
    }
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    vertexCount,
    triangleCount,
    zMin,
    zMax,
  }
}

/** Unit direction in ENU for an azimuth (from north, clockwise) and an elevation, both in degrees. */
export function directionEnu(azDeg: number, elDeg: number): [number, number, number] {
  const azRad = (azDeg * Math.PI) / 180
  const elRad = (elDeg * Math.PI) / 180
  const cosEl = Math.cos(elRad)
  return [
    Math.sin(azRad) * cosEl,
    Math.cos(azRad) * cosEl,
    Math.sin(elRad),
  ]
}

/** Height of the terrain above the site at an ENU position (x east, y north, metres), bilinear; null outside the grid. */
export function heightAt(
  heights: Float32Array,
  sizePx: number,
  spacingM: number,
  x: number,
  y: number,
): number | null {
  if (spacingM <= 0 || sizePx <= 0) return null
  const col = x / spacingM + sizePx / 2
  const row = sizePx / 2 - y / spacingM

  if (
    Number.isNaN(col) ||
    Number.isNaN(row) ||
    col < 0 ||
    col > sizePx - 1 ||
    row < 0 ||
    row > sizePx - 1
  ) {
    return null
  }

  const c0 = Math.floor(col)
  const r0 = Math.floor(row)
  const c1 = Math.min(c0 + 1, sizePx - 1)
  const r1 = Math.min(r0 + 1, sizePx - 1)

  const fc = col - c0
  const fr = row - r0

  const h00 = heights[r0 * sizePx + c0]
  const h01 = heights[r0 * sizePx + c1]
  const h10 = heights[r1 * sizePx + c0]
  const h11 = heights[r1 * sizePx + c1]

  const top = h00 * (1 - fc) + h01 * fc
  const bottom = h10 * (1 - fc) + h11 * fc

  return top * (1 - fr) + bottom * fr
}
