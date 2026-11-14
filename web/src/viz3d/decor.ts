import * as THREE from 'three'
import type { TierSettings } from './quality'
import { BOULDERS, CRATER_RIMS, SMALL_ROCKS, scatterItems } from './scatter'
import type { ScatterItem } from './scatter'
import { TIERS } from './quality'

// Decoration only: rocks and crater rims scattered on the terrain. The terrain geometry from the
// data is never changed, so the horizon silhouette stays data-true.

export interface DecorHost {
  /** Terrain height at a three.js (x, z), exaggeration included. */
  groundY(x: number, z: number): number
  /** Half size of the terrain patch in metres. */
  halfExtentM: number
}

function frac(x: number): number {
  return x - Math.floor(x)
}

function rockGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 2)
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const k = 0.82 + 0.13 * Math.sin(3.1 * x + 0.7 * z) + 0.1 * Math.sin(4.3 * y - 1.9 * x) + 0.07 * Math.sin(6.7 * z + 2.1 * y)
    pos.setXYZ(i, x * k, Math.max(y * k, -0.55), z * k)
  }
  geo.computeVertexNormals()
  return geo
}

/** Cross section of a crater rim: radius in crater radii, height in rim heights. */
const RIM_PROFILE: readonly (readonly [number, number])[] = [
  [0.8, 0],
  [0.94, 0.5],
  [1.0, 1],
  [1.07, 0.6],
  [1.28, 0.14],
  [1.55, 0],
]
const RIM_SEGMENTS = 28
const RIM_HEIGHT = 0.05
const RIM_LIFT_M = 0.06

/** Draped crater rims, one merged mesh: every ring vertex follows the terrain. */
export function buildRimGeometry(items: readonly ScatterItem[], host: DecorHost): THREE.BufferGeometry {
  const perRing = RIM_PROFILE.length
  const verts = items.length * (RIM_SEGMENTS + 1) * perRing
  const pos = new Float32Array(verts * 3)
  const idx = new Uint32Array(items.length * RIM_SEGMENTS * (perRing - 1) * 6)
  let v = 0
  let t = 0
  for (const it of items) {
    const cx = it.eastM
    const cz = -it.northM
    const base = v
    for (let s = 0; s <= RIM_SEGMENTS; s++) {
      const a = (s / RIM_SEGMENTS) * Math.PI * 2
      const c = Math.cos(a)
      const sn = Math.sin(a)
      for (const [rr, hh] of RIM_PROFILE) {
        const x = cx + c * rr * it.size
        const z = cz + sn * rr * it.size
        pos[v * 3] = x
        pos[v * 3 + 1] = host.groundY(x, z) + RIM_LIFT_M + hh * RIM_HEIGHT * it.size
        pos[v * 3 + 2] = z
        v++
      }
    }
    for (let s = 0; s < RIM_SEGMENTS; s++) {
      for (let p = 0; p < perRing - 1; p++) {
        const a = base + s * perRing + p
        const b = a + perRing
        idx[t++] = a
        idx[t++] = a + 1
        idx[t++] = b
        idx[t++] = a + 1
        idx[t++] = b + 1
        idx[t++] = b
      }
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.computeVertexNormals()
  return geo
}

export class Decor {
  readonly group = new THREE.Group()
  private readonly rockGeo = rockGeometry()
  private readonly near: THREE.InstancedMesh
  private readonly far: THREE.InstancedMesh
  private readonly boulders: THREE.InstancedMesh
  private readonly rims: THREE.Mesh
  private readonly dummy = new THREE.Object3D()
  private readonly color = new THREE.Color()

  constructor(rockMaterial: THREE.MeshStandardMaterial, rimMaterial: THREE.MeshStandardMaterial) {
    const max = TIERS.high
    this.near = this.makeRocks(rockMaterial, max.shadowRocks, true)
    this.far = this.makeRocks(rockMaterial, max.smallRocks, false)
    this.boulders = this.makeRocks(rockMaterial, max.boulders, false)
    this.boulders.castShadow = true
    this.rims = new THREE.Mesh(new THREE.BufferGeometry(), rimMaterial)
    this.rims.receiveShadow = true
    this.rims.frustumCulled = false
    this.rims.name = 'crater-rims'
    this.group.add(this.near, this.far, this.boulders, this.rims)
    this.group.name = 'decor'
  }

  private makeRocks(mat: THREE.Material, count: number, cast: boolean): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.rockGeo, mat, Math.max(1, count))
    m.count = 0
    m.castShadow = cast
    m.receiveShadow = true
    m.frustumCulled = false
    m.name = cast ? 'rocks-near' : 'rocks'
    return m
  }

  private fill(mesh: THREE.InstancedMesh, items: readonly ScatterItem[], host: DecorHost): void {
    const half = host.halfExtentM - 2
    let n = 0
    for (const it of items) {
      if (n >= mesh.instanceMatrix.count) break
      const x = it.eastM
      const z = -it.northM
      if (Math.abs(x) > half || Math.abs(z) > half) continue
      const s = it.size
      const sy = s * (0.45 + 0.35 * frac(it.tone * 7.1))
      this.dummy.position.set(x, host.groundY(x, z) - 0.2 * sy, z)
      this.dummy.rotation.set(0.25 * (frac(it.tone * 3.7) - 0.5), it.yawRad, 0.25 * (frac(it.tone * 5.3) - 0.5))
      this.dummy.scale.set(s * (0.8 + 0.4 * it.tone), sy, s * (0.7 + 0.5 * frac(it.tone * 13.7)))
      this.dummy.updateMatrix()
      mesh.setMatrixAt(n, this.dummy.matrix)
      const g = 0.16 + 0.2 * frac(it.tone * 3.3)
      this.color.setRGB(g, g * 0.97, g * 0.92)
      mesh.setColorAt(n, this.color)
      n++
    }
    mesh.count = n
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /** Re-scatter around a centre (east, north metres). Same inputs always give the same decoration. */
  update(centerE: number, centerN: number, tier: TierSettings, host: DecorHost): void {
    const small = scatterItems(centerE, centerN, { ...SMALL_ROCKS, maxCount: tier.smallRocks })
    const nearItems = small.slice(0, Math.min(tier.shadowRocks, this.near.instanceMatrix.count))
    this.fill(this.near, nearItems, host)
    this.fill(this.far, small.slice(nearItems.length), host)
    this.fill(this.boulders, scatterItems(centerE, centerN, { ...BOULDERS, maxCount: tier.boulders }), host)

    const half = host.halfExtentM
    const rimItems = scatterItems(centerE, centerN, { ...CRATER_RIMS, maxCount: tier.craters }).filter(
      (c) => Math.abs(c.eastM) + c.size * 1.6 < half && Math.abs(c.northM) + c.size * 1.6 < half,
    )
    this.rims.geometry.dispose()
    this.rims.geometry = buildRimGeometry(rimItems, host)
  }

  get instanceCount(): number {
    return this.near.count + this.far.count + this.boulders.count
  }
}
