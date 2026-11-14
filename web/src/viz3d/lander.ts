import * as THREE from 'three'

// Everything here is in three.js coordinates (y up). The ENU mapping lives in scene.ts.

const FOIL = new THREE.Color(0xc9a24a)
const HULL = new THREE.Color(0xd8d8d4)
const DARK = new THREE.Color(0x3a3f4a)

/** Free every geometry, material and texture under an object. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach(disposeMaterial)
    else if (mat) disposeMaterial(mat)
  })
}

function disposeMaterial(mat: THREE.Material): void {
  for (const v of Object.values(mat)) {
    if (v instanceof THREE.Texture) v.dispose()
  }
  mat.dispose()
}

/** Low-poly lander, about 4 m across the feet, standing on y = 0. */
export function buildLander(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'lander'

  const foil = new THREE.MeshStandardMaterial({ color: FOIL, roughness: 0.55, metalness: 0.3 })
  const hull = new THREE.MeshStandardMaterial({ color: HULL, roughness: 0.8, metalness: 0.1 })
  const dark = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.7, metalness: 0.2 })

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
    return m
  }

  // Descent stage and upper deck.
  add(new THREE.BoxGeometry(2.2, 1.2, 2.2), foil, 0, 1.9, 0)
  add(new THREE.CylinderGeometry(1.0, 1.15, 0.6, 8), hull, 0, 2.8, 0)
  add(new THREE.CylinderGeometry(0.35, 0.55, 0.5, 12), dark, 0, 1.05, 0) // engine bell

  // Four legs with foot pads, splayed to about 3.9 m across.
  const up = new THREE.Vector3(0, 1, 0)
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const top = new THREE.Vector3(0.95 * sx, 1.6, 0.95 * sz)
    const foot = new THREE.Vector3(1.95 * sx, 0.06, 1.95 * sz)
    const dir = foot.clone().sub(top)
    const leg = add(new THREE.CylinderGeometry(0.07, 0.09, dir.length(), 6), dark, 0, 0, 0)
    leg.position.copy(top).addScaledVector(dir, 0.5)
    leg.quaternion.setFromUnitVectors(up, dir.clone().normalize())
    add(new THREE.CylinderGeometry(0.38, 0.42, 0.08, 10), foil, foot.x, 0.04, foot.z)
  }

  // Mast and dish pointing at the sky.
  add(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), dark, 0.55, 3.55, 0.3)
  const dish = add(
    new THREE.SphereGeometry(0.55, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    hull,
    0.55,
    4.05,
    0.3,
  )
  dish.rotation.set(0.35, 0, -0.25)
  ;(dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide

  // Solar panel on one side.
  const panel = add(new THREE.BoxGeometry(0.06, 1.3, 1.9), dark, -1.35, 2.2, 0)
  panel.rotation.z = 0.15

  return g
}

/**
 * Thin ring draped on the terrain around the lander so it can be found in the overview.
 * `groundY(x, z)` returns the terrain height in three.js coordinates.
 */
export function buildMarkerRing(
  groundY: (x: number, z: number) => number,
  innerR = 230,
  outerR = 260,
  segments = 96,
  lift = 2,
): THREE.Mesh {
  const pos = new Float32Array((segments + 1) * 2 * 3)
  const idx: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (let k = 0; k < 2; k++) {
      const r = k === 0 ? innerR : outerR
      const o = (i * 2 + k) * 3
      pos[o] = c * r
      pos[o + 1] = groundY(c * r, s * r) + lift
      pos[o + 2] = s * r
    }
    if (i < segments) {
      const a0 = i * 2
      idx.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffc233,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const ring = new THREE.Mesh(geo, mat)
  ring.name = 'marker-ring'
  return ring
}
