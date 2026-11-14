import * as THREE from 'three'
import { legendRange, viridisRgb } from './landerHelpers'

export interface HeatmapTextureResult {
  texture: THREE.CanvasTexture
  min: number
  max: number
}

/**
 * Creates a Three.js CanvasTexture draped with the colour-blind-safe Viridis sequential ramp.
 * Row 0 is North, row gridN-1 is South, col 0 is West, col gridN-1 is East.
 */
export function createHeatmapTexture(
  grid: Float32Array,
  gridN: number,
): HeatmapTextureResult {
  const { min, max } = legendRange(grid)
  const range = max - min > 1e-4 ? max - min : 100

  const canvas = document.createElement('canvas')
  canvas.width = gridN
  canvas.height = gridN
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create 2d canvas context for heatmap')
  }

  const imgData = ctx.createImageData(gridN, gridN)
  const data = imgData.data

  for (let r = 0; r < gridN; r++) {
    for (let c = 0; c < gridN; c++) {
      const idx = r * gridN + c
      const val = grid[idx]
      const px = idx * 4
      if (Number.isNaN(val)) {
        // Void/masked area: dark neutral tint
        data[px] = 22
        data[px + 1] = 27
        data[px + 2] = 38
        data[px + 3] = 160
      } else {
        const t = (val - min) / range
        const [red, green, blue] = viridisRgb(t)
        data[px] = red
        data[px + 1] = green
        data[px + 2] = blue
        data[px + 3] = 255
      }
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return { texture, min, max }
}
