import * as THREE from 'three'

// Distance of the Sun and Earth discs from the camera. Sizes use the true angular radius at this range.
export const SKY_DIST_M = 40_000
export const STAR_DIST_M = 90_000
export const STAR_COUNT = 1500
export const MAGNIFY = 4

/** Small seeded PRNG (mulberry32) so the stars are identical on every load. */
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

/** Static star points on the upper hemisphere (three.js coordinates, y up). */
export function buildStars(count = STAR_COUNT, seed = 20261114): THREE.Points {
  const rnd = mulberry32(seed)
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Uniform on the sphere, folded to y >= 0.
    const y = rnd()
    const phi = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    pos[i * 3] = Math.cos(phi) * r * STAR_DIST_M
    pos[i * 3 + 1] = y * STAR_DIST_M
    pos[i * 3 + 2] = Math.sin(phi) * r * STAR_DIST_M
    const b = 0.35 + 0.65 * rnd() ** 2
    col[i * 3] = b
    col[i * 3 + 1] = b
    col[i * 3 + 2] = b
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  const mat = new THREE.PointsMaterial({
    size: 1.6,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  })
  const stars = new THREE.Points(geo, mat)
  stars.frustumCulled = false
  stars.name = 'stars'
  return stars
}

export interface BodyMeshes {
  sun: THREE.Mesh
  earth: THREE.Mesh
}

// Earth shaded by the Sun direction: the lit share of the visible disc is (1 - cos e) / 2 for a
// Sun-Earth separation e, the same value as earthIlluminatedFraction in lib/earthPhase.ts.
const EARTH_VERT = `
varying vec3 vN;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const EARTH_FRAG = `
uniform vec3 uSun;
uniform vec3 uDay;
uniform vec3 uNight;
varying vec3 vN;
void main() {
  float lit = smoothstep(-0.03, 0.03, dot(normalize(vN), uSun));
  gl_FragColor = vec4(mix(uNight, uDay, lit), 1.0);
  #include <colorspace_fragment>
}`

export function earthMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: new THREE.Vector3(0, 1, 0) },
      uDay: { value: new THREE.Color(0x4aa8ff) },
      uNight: { value: new THREE.Color(0x0a1a2e) },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
  })
}

/** Direction (three.js coordinates) the lit side of the Earth faces. */
export function setEarthSun(earth: THREE.Mesh, sunDir: THREE.Vector3 | null): void {
  if (!sunDir) return
  const mat = earth.material as THREE.ShaderMaterial
  ;(mat.uniforms.uSun.value as THREE.Vector3).copy(sunDir)
}

/** Unit-radius spheres; `placeBody` scales and positions them. */
export function buildBodies(): BodyMeshes {
  const geo = new THREE.SphereGeometry(1, 40, 20)
  const sun = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: 0xfff1c2, toneMapped: false }),
  )
  const earth = new THREE.Mesh(geo, earthMaterial())
  sun.name = 'sun-disc'
  earth.name = 'earth-disc'
  for (const m of [sun, earth]) m.frustumCulled = false
  return { sun, earth }
}

/**
 * Put a body at SKY_DIST_M in a unit direction (three.js coordinates, relative to the sky group).
 * Its angular radius is `angRadiusDeg * k`. Hidden when it lies fully below the horizon plane.
 */
export function placeBody(
  mesh: THREE.Mesh,
  dir: THREE.Vector3 | null,
  elDeg: number,
  angRadiusDeg: number,
  k: number,
): void {
  const ang = angRadiusDeg * k
  if (!dir || elDeg < -ang) {
    mesh.visible = false
    return
  }
  mesh.visible = true
  mesh.position.copy(dir).multiplyScalar(SKY_DIST_M)
  mesh.scale.setScalar(SKY_DIST_M * Math.sin((ang * Math.PI) / 180))
}
