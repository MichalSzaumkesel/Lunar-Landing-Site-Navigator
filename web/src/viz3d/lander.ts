import * as THREE from 'three'
import { makeCrinkleTexture } from './textures'

// Everything here is in three.js coordinates (y up). The ENU mapping lives in scene.ts.

/** The lander is lowered this far into the regolith so the foot pads sit in it. */
export const LANDER_SINK_M = 0.05

/** Free every geometry, material and texture under an object (also textures held in shader uniforms). */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach(disposeMaterial)
    else if (mat) disposeMaterial(mat)
    ;(o as THREE.InstancedMesh).dispose?.()
  })
}

function disposeMaterial(mat: THREE.Material): void {
  for (const v of Object.values(mat)) {
    if (v instanceof THREE.Texture) v.dispose()
  }
  const uniforms = (mat as THREE.ShaderMaterial).uniforms
  if (uniforms) {
    for (const u of Object.values(uniforms)) {
      if (u.value instanceof THREE.Texture) u.value.dispose()
    }
  }
  mat.dispose()
}

/**
 * A dim environment for the metallic foil: black sky, a grey ground bounce. Returns the PMREM render
 * target; the caller owns it and must dispose it.
 */
export function buildLanderEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const geo = new THREE.SphereGeometry(10, 24, 12)
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10
    const sky = [0.012, 0.016, 0.03]
    const ground = [0.3, 0.285, 0.265]
    const t = THREE.MathUtils.smoothstep(y, -0.12, 0.08)
    for (let c = 0; c < 3; c++) colors[i * 3 + c] = ground[c] + (sky[c] - ground[c]) * t
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })
  const envScene = new THREE.Scene()
  envScene.add(new THREE.Mesh(geo, mat))
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(envScene, 0.02)
  pmrem.dispose()
  geo.dispose()
  mat.dispose()
  return target
}

export interface LanderOptions {
  env: THREE.Texture | null
  /** Hook to install shader patches on every standard material. */
  patch: (m: THREE.MeshStandardMaterial) => void
}

function ringAlphaTexture(): THREE.DataTexture {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x / (n - 1) - 0.5, y / (n - 1) - 0.5) * 2
      const a = r > 1 ? 0 : Math.sin(Math.PI * Math.min(1, r * 1.0)) * (0.25 + 0.75 * (1 - r))
      const v = Math.round(Math.max(0, Math.min(1, a)) * 255)
      const o = (y * n + x) * 4
      data[o] = data[o + 1] = data[o + 2] = v
      data[o + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, n, n)
  t.needsUpdate = true
  return t
}

/**
 * Generic procedural lander, about 4 m across the feet, standing on y = 0 (feet at y 0 to 0.1).
 * Octagonal foil body, four splayed legs with braces, engine bell, antenna dish, thruster blocks,
 * a ladder and a hatch. No mission markings.
 */
export function buildLander(opts: LanderOptions): THREE.Group {
  const g = new THREE.Group()
  g.name = 'lander'

  const crinkle = makeCrinkleTexture(128)
  crinkle.wrapS = crinkle.wrapT = THREE.RepeatWrapping
  crinkle.repeat.set(2, 1.5)
  const mk = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ envMap: opts.env, ...p })
    opts.patch(m)
    return m
  }
  const gold = mk({ color: 0xd9a63e, metalness: 0.95, roughness: 0.34, bumpMap: crinkle, bumpScale: 0.5 })
  const silver = mk({ color: 0xcfd4da, metalness: 0.95, roughness: 0.3, bumpMap: crinkle, bumpScale: 0.3 })
  const white = mk({ color: 0xe8e7e2, metalness: 0.15, roughness: 0.62 })
  const dark = mk({ color: 0x2c3036, metalness: 0.6, roughness: 0.5 })
  const black = mk({ color: 0x15171a, metalness: 0.8, roughness: 0.42, side: THREE.DoubleSide })
  const panel = mk({ color: 0x1c2a4a, metalness: 0.55, roughness: 0.28 })

  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    parent.add(m)
    return m
  }

  // Descent stage (gold foil) and upper deck (white thermal skin), both octagonal.
  add(g, new THREE.CylinderGeometry(1.2, 1.3, 1.1, 8), gold, 0, 1.65, 0)
  add(g, new THREE.CylinderGeometry(0.95, 1.2, 0.7, 8), white, 0, 2.55, 0)
  add(g, new THREE.CylinderGeometry(0.9, 0.9, 0.06, 8), dark, 0, 2.93, 0)
  const corner = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4
    add(g, corner, silver, 1.27 * Math.sin(a), 1.65, 1.27 * Math.cos(a))
  }

  // Engine bell under the body.
  const bellProfile = [
    [0.2, 1.1],
    [0.19, 0.98],
    [0.22, 0.86],
    [0.3, 0.72],
    [0.42, 0.58],
    [0.5, 0.46],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  add(g, new THREE.LatheGeometry(bellProfile, 20), black)
  add(g, new THREE.TorusGeometry(0.21, 0.025, 6, 16), silver, 0, 0.9, 0).rotation.x = Math.PI / 2

  // Four legs on the body corners at 45, 135, 225 and 315 degrees. Each leg is built in its own
  // frame: z is outward, y is up, x is tangential.
  const up = new THREE.Vector3(0, 1, 0)
  const top = new THREE.Vector3(0, 1.75, 1.0)
  const foot = new THREE.Vector3(0, 0.1, 1.95)
  const brace = new THREE.Vector3(0, 2.25, 0.8)
  const ringTex = ringAlphaTexture()
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x55524d,
    roughness: 1,
    metalness: 0,
    alphaMap: ringTex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  })
  opts.patch(ringMat)
  const padGeo = new THREE.CylinderGeometry(0.3, 0.34, 0.1, 12)
  const jointGeo = new THREE.SphereGeometry(0.09, 10, 8)
  const strutDir = foot.clone().sub(top)
  const upperLen = strutDir.length() * 0.55
  const strutUp = strutDir.clone().normalize()
  const upperGeo = new THREE.CylinderGeometry(0.075, 0.075, upperLen, 8)
  const lowerGeo = new THREE.CylinderGeometry(0.052, 0.052, strutDir.length() - upperLen, 8)
  const mid = top.clone().addScaledVector(strutUp, upperLen)
  const braceDir = mid.clone().sub(brace)
  const braceGeo = new THREE.CylinderGeometry(0.04, 0.04, braceDir.length(), 6)

  for (let k = 0; k < 4; k++) {
    const leg = new THREE.Group()
    leg.rotation.y = Math.PI / 4 + (k * Math.PI) / 2
    g.add(leg)
    const q = new THREE.Quaternion().setFromUnitVectors(up, strutUp)
    const upper = add(leg, upperGeo, silver)
    upper.position.copy(top).addScaledVector(strutUp, upperLen / 2)
    upper.quaternion.copy(q)
    const lower = add(leg, lowerGeo, dark)
    lower.position.copy(mid).addScaledVector(strutUp, (strutDir.length() - upperLen) / 2)
    lower.quaternion.copy(q)
    const b = add(leg, braceGeo, dark)
    b.position.copy(brace).addScaledVector(braceDir, 0.5)
    b.quaternion.setFromUnitVectors(up, braceDir.clone().normalize())
    add(leg, jointGeo, silver, 0, foot.y + 0.1, foot.z)
    add(leg, padGeo, silver, 0, 0.05, foot.z)
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), ringMat)
    decal.rotation.x = -Math.PI / 2
    decal.position.set(0, 0.06, foot.z)
    decal.receiveShadow = true
    leg.add(decal)

    if (k === 0) {
      // Ladder on the first leg: two rails and five rungs along the strut, a small porch at the top.
      const railGeo = new THREE.CylinderGeometry(0.018, 0.018, strutDir.length() * 0.95, 5)
      const centre = top.clone().addScaledVector(strutUp, strutDir.length() * 0.48)
      for (const sx of [-0.17, 0.17]) {
        const rail = add(leg, railGeo, silver, sx, centre.y, centre.z + 0.05)
        rail.quaternion.copy(q)
      }
      const rungGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.34, 5)
      for (let r = 0; r < 5; r++) {
        const p = top.clone().addScaledVector(strutUp, strutDir.length() * (0.12 + r * 0.18))
        add(leg, rungGeo, silver, 0, p.y, p.z + 0.05).rotation.z = Math.PI / 2
      }
      add(leg, new THREE.BoxGeometry(0.5, 0.04, 0.34), dark, 0, 1.95, 1.12)
    }
  }

  // Hatch on the face between the ladder leg and the next one.
  const hatch = new THREE.Group()
  hatch.rotation.y = (67.5 * Math.PI) / 180
  g.add(hatch)
  add(hatch, new THREE.BoxGeometry(0.55, 0.72, 0.05), dark, 0, 1.85, 1.12)
  add(hatch, new THREE.BoxGeometry(0.66, 0.82, 0.03), silver, 0, 1.85, 1.1)
  add(hatch, new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5), silver, 0.3, 1.55, 1.18).rotation.z = Math.PI / 2

  // Thruster blocks with two nozzles each, at the corners of the upper deck.
  const blockGeo = new THREE.BoxGeometry(0.24, 0.22, 0.26)
  const nozzleGeo = new THREE.ConeGeometry(0.05, 0.13, 8, 1, true)
  for (let k = 0; k < 4; k++) {
    const t = new THREE.Group()
    t.rotation.y = (k * Math.PI) / 2
    g.add(t)
    add(t, blockGeo, dark, 0, 2.5, 1.02)
    for (const sx of [-0.06, 0.06]) {
      const n = add(t, nozzleGeo, black, sx, 2.5, 1.2)
      n.rotation.x = Math.PI / 2
    }
  }

  // Mast and dish, tilted towards the sky.
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.85, 6), silver, 0.45, 3.36, -0.25)
  const dishGroup = new THREE.Group()
  dishGroup.position.set(0.45, 3.82, -0.25)
  dishGroup.rotation.set(-0.45, 0.4, 0)
  g.add(dishGroup)
  const dish = add(dishGroup, new THREE.SphereGeometry(0.5, 28, 8, 0, Math.PI * 2, 0, 0.95), white)
  dish.scale.y = 0.55
  ;(dish.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
  dish.rotation.x = Math.PI
  add(dishGroup, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 5), dark, 0, 0.14, 0)
  add(dishGroup, new THREE.SphereGeometry(0.035, 8, 6), dark, 0, 0.3, 0)

  // Two folded-out solar panels on the deck, in a silver frame.
  for (const sx of [-1, 1]) {
    const p = new THREE.Group()
    p.position.set(sx * 1.5, 2.72, 0)
    p.rotation.z = -sx * 0.14
    g.add(p)
    add(p, new THREE.BoxGeometry(1.1, 0.04, 1.5), panel)
    add(p, new THREE.BoxGeometry(1.16, 0.03, 1.56), silver, 0, -0.025, 0)
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), silver, sx * 0.95, 2.78, 0).rotation.z = Math.PI / 2
  }

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
