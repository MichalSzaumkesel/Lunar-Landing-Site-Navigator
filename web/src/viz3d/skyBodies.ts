import * as THREE from 'three'
import { mulberry32 } from './noise'
import { horizonGlowStrength } from './viewMath'
import { buildStarData } from './textures'
import { skirtPositions } from './skirt'
import { FADE_OFF, FX_FULL } from './bodyFade'
import type { BodyFx } from './bodyFade'

export { mulberry32 }

// Sky layout, all around the camera (the sky group follows it):
// skirt wall at SKIRT_RADIUS_M, the Sun and Earth at SKY_DIST_M, stars and Milky Way at STAR_DIST_M.
// The wall stands in front of the bodies, so anything under the horizon mask is hidden by depth.
export const SKIRT_RADIUS_M = 40_000
export const SKY_DIST_M = 60_000
export const STAR_DIST_M = 120_000
/** Half size of the Sun glare plane, in Sun disc radii. */
const GLOW_RHO = 44
/** The glare never grows beyond this half size, so a big Sun does not wash out the whole sky. */
const GLOW_MAX_DEG = 30

const DEG = Math.PI / 180
const ZERO = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
const tmpM = new THREE.Matrix4()

/** Turn a plane that sits at `p` (relative to the sky centre) to face the centre, keeping y up. */
function faceOrigin(obj: THREE.Object3D, p: THREE.Vector3): void {
  tmpM.lookAt(ZERO, p, UP)
  obj.quaternion.setFromRotationMatrix(tmpM)
}

// Stars

const STAR_VERT = `
attribute float aSize;
attribute vec3 aColor;
uniform float uPx;
uniform vec3 uSunDir;
varying vec3 vCol;
void main() {
  float sunFade = smoothstep( 0.004, 0.06, 1.0 - dot( normalize( position ), uSunDir ) );
  vCol = aColor * sunFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_PointSize = aSize * uPx;
}`
const STAR_FRAG = `
varying vec3 vCol;
void main() {
  float d = length( gl_PointCoord - 0.5 ) * 2.0;
  float a = 1.0 - smoothstep( 0.0, 1.0, d );
  a *= a;
  gl_FragColor = vec4( vCol * a * 1.5, 1.0 );
  #include <colorspace_fragment>
}`

/** Procedural stars (decorative, not a catalogue); they fade out near the Sun, where glare would hide them. */
export function buildStars(count: number, pixelRatio: number): THREE.Points {
  const data = buildStarData(count)
  const pos = new Float32Array(data.positions.length)
  for (let i = 0; i < pos.length; i++) pos[i] = data.positions[i] * STAR_DIST_M
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(data.colors, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: pixelRatio }, uSunDir: { value: new THREE.Vector3(0, -1, 0) } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const stars = new THREE.Points(geo, mat)
  stars.frustumCulled = false
  stars.name = 'stars'
  return stars
}

export function setStarSun(stars: THREE.Points, sunDir: THREE.Vector3 | null): void {
  const u = (stars.material as THREE.ShaderMaterial).uniforms
  ;(u.uSunDir.value as THREE.Vector3).copy(sunDir ?? new THREE.Vector3(0, -1, 0))
}

/** Faint Milky Way: an inside-out sphere carrying a procedural band texture (decorative). */
export function buildMilkyWay(map: THREE.Texture): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    dithering: true,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(STAR_DIST_M * 0.98, 32, 16), mat)
  mesh.rotation.set(0.55, 0.8, 1.05)
  mesh.frustumCulled = false
  mesh.name = 'milky-way'
  return mesh
}

// Horizon hint: a soft glow on the horizon for a body that is hidden behind it

const HINT_VERT = `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`
const HINT_FRAG = `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vP;
void main() {
  float g = exp( - ( vP.x * vP.x * 2.6 + vP.y * vP.y * 6.0 ) ) * ( 1.0 - smoothstep( 0.6, 1.0, abs( vP.x ) ) ) * ( 1.0 - smoothstep( 0.6, 1.0, abs( vP.y ) ) );
  gl_FragColor = vec4( uColor * g * uAlpha, 1.0 );
  #include <colorspace_fragment>
}`
const HINT_HALF_WIDTH_DEG = 16
const HINT_HALF_HEIGHT_DEG = 3.2

function buildHint(color: THREE.Vector3): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uAlpha: { value: 0 } },
    vertexShader: HINT_VERT,
    fragmentShader: HINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  mesh.scale.set(SKY_DIST_M * Math.tan(HINT_HALF_WIDTH_DEG * DEG), SKY_DIST_M * Math.tan(HINT_HALF_HEIGHT_DEG * DEG), 1)
  mesh.visible = false
  mesh.frustumCulled = false
  mesh.name = 'horizon-hint'
  return mesh
}

function placeHint(hint: THREE.Mesh, hintDir: THREE.Vector3 | null, strength: number): void {
  if (!hintDir || strength <= 0) {
    hint.visible = false
    return
  }
  hint.visible = true
  hint.position.copy(hintDir).multiplyScalar(SKY_DIST_M)
  faceOrigin(hint, hint.position)
  ;(hint.material as THREE.ShaderMaterial).uniforms.uAlpha.value = 0.55 * strength
}

/** What the scene tells a body rig each time the sky changes. */
export interface BodyPlacement {
  /** Unit direction (three.js axes) of the body, null when unknown. */
  dir: THREE.Vector3 | null
  elDeg: number
  /** Direction of the horizon at the body's azimuth, slightly raised, for the hint glow. */
  hintDir: THREE.Vector3 | null
  /** Body elevation minus local horizon elevation at its azimuth. */
  clearanceDeg: number
  /** Rendered angular radius (true radius times the size slider). */
  angRadiusDeg: number
}

/**
 * A body disc remains visible in 3D until its entire disc sinks below the terrain horizon.
 * It vanishes only when its upper limb passes below the horizon line (clearanceDeg < -angRadiusDeg),
 * not at its centre (clearanceDeg < 0) and not earlier.
 */
export function isBodyVisible(clearanceDeg: number, angRadiusDeg: number): boolean {
  return clearanceDeg >= -angRadiusDeg
}

export function hiddenByHorizon(p: BodyPlacement): boolean {
  return !p.dir || !isBodyVisible(p.clearanceDeg, p.angRadiusDeg)
}

// Sun

const SUN_CORE_VERT = `
varying vec3 vN;
varying vec3 vVd;
void main() {
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  vN = normalize( normalMatrix * normal );
  vVd = normalize( - mv.xyz );
  gl_Position = projectionMatrix * mv;
}`
// Limb darkening: the disc is brightest in the middle and redder and darker at the rim.
const SUN_CORE_FRAG = `
uniform float uIntensity;
uniform float uFade;
varying vec3 vN;
varying vec3 vVd;
void main() {
  float mu = clamp( dot( normalize( vN ), normalize( vVd ) ), 0.0, 1.0 );
  float limb = 1.0 - 0.62 * ( 1.0 - mu );
  vec3 base = mix( vec3( 1.0, 0.45, 0.18 ), vec3( 1.0, 0.93, 0.8 ), pow( mu, 0.45 ) );
  gl_FragColor = vec4( base * limb * uIntensity, uFade );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
const SUN_GLOW_VERT = HINT_VERT
const SUN_GLOW_FRAG = `
uniform float uRho;
uniform float uFade;
uniform float uStreak;
uniform vec3 uColor;
varying vec2 vP;
void main() {
  float r = length( vP );
  float rho = r * uRho;
  float edge = 1.0 - smoothstep( 0.25, 1.0, r );
  float q = rho / 2.8;
  float halo = ( 2.2 / pow( 1.0 + q * q, 1.25 ) + 0.07 * exp( - rho / 10.0 ) ) * edge;
  float streak = uStreak * 0.35 * exp( - abs( vP.y ) * uRho * 1.1 ) * exp( - abs( vP.x ) * 3.0 ) * edge;
  gl_FragColor = vec4( uColor * ( halo + streak ) * uFade, 1.0 );
  #include <colorspace_fragment>
}`

export interface SunRig {
  root: THREE.Group
  core: THREE.Mesh
  glow: THREE.Mesh
  hint: THREE.Mesh
  /** Shared by the disc and the glare: 0 (gone) to 1 (fully shown). */
  fade: { value: number }
}

export function buildSun(glare: boolean): SunRig {
  const fade = { value: 1 }
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uIntensity: { value: 10 }, uFade: fade },
      vertexShader: SUN_CORE_VERT,
      fragmentShader: SUN_CORE_FRAG,
    }),
  )
  core.name = 'sun-disc'
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        uRho: { value: GLOW_RHO },
        uFade: fade,
        uStreak: { value: glare ? 1 : 0 },
        uColor: { value: new THREE.Vector3(1.0, 0.86, 0.62) },
      },
      vertexShader: SUN_GLOW_VERT,
      fragmentShader: SUN_GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  glow.name = 'sun-glow'
  const hint = buildHint(new THREE.Vector3(1.0, 0.72, 0.38))
  const root = new THREE.Group()
  root.add(core, glow)
  for (const m of [core, glow]) m.frustumCulled = false
  return { root, core, glow, hint, fade }
}

export function setSunGlare(rig: SunRig, glare: boolean): void {
  ;(rig.glow.material as THREE.ShaderMaterial).uniforms.uStreak.value = glare ? 1 : 0
}

/**
 * `fx` is the eased blend of the body (see bodyFade.ts): while it fades the disc is drawn translucent
 * and slightly smaller, and the horizon hint takes over; the position is always exact.
 */
export function placeSun(rig: SunRig, p: BodyPlacement, fx: BodyFx = FX_FULL): void {
  const on = Boolean(p.dir) && fx.opacity > FADE_OFF
  rig.root.visible = on
  rig.fade.value = fx.opacity
  ;(rig.core.material as THREE.ShaderMaterial).transparent = fx.opacity < 1
  if (on && p.dir) {
    const r = SKY_DIST_M * Math.sin(p.angRadiusDeg * DEG) * fx.scale
    rig.root.position.copy(p.dir).multiplyScalar(SKY_DIST_M)
    const glowHalf = Math.min(r * GLOW_RHO, SKY_DIST_M * Math.tan(GLOW_MAX_DEG * DEG))
    rig.core.scale.setScalar(r)
    rig.glow.scale.setScalar(glowHalf)
    ;(rig.glow.material as THREE.ShaderMaterial).uniforms.uRho.value = glowHalf / r
  }
  placeHint(rig.hint, p.hintDir, p.dir ? horizonGlowStrength(p.clearanceDeg, p.angRadiusDeg) * (1 - fx.opacity) : 0)
}

/** Keep the glare plane square to the camera. */
export function faceSunGlow(rig: SunRig, cameraQuat: THREE.Quaternion): void {
  rig.glow.quaternion.copy(cameraQuat)
}

// Earth

const EARTH_VERT = `
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vN = normalize( mat3( modelMatrix ) * normal );
  vV = normalize( cameraPosition - wp.xyz );
  gl_Position = projectionMatrix * viewMatrix * wp;
}`
const EARTH_FRAG = `
uniform sampler2D tDay;
uniform sampler2D tCloud;
uniform vec3 uSun;
uniform vec3 uFallback;
uniform float uHasTex;
uniform float uSpin;
uniform float uSunI;
uniform float uFade;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vec3 N = normalize( vN );
  vec3 V = normalize( vV );
  float ndl = dot( N, uSun );
  vec2 uv = vec2( vUv.x + uSpin, vUv.y );
  vec3 albedo = uFallback;
  float cloudShadow = 0.0;
  float ocean = 0.6;
  if ( uHasTex > 0.5 ) {
    albedo = texture2D( tDay, uv ).rgb;
    float lum = dot( albedo, vec3( 0.3, 0.5, 0.2 ) );
    ocean = smoothstep( 0.0, 0.05, albedo.b - max( albedo.r, albedo.g * 0.85 ) ) * ( 1.0 - smoothstep( 0.35, 0.6, lum ) );
    vec3 cs = texture2D( tCloud, uv + vec2( 0.004, -0.003 ) ).rgb;
    cloudShadow = dot( cs, vec3( 0.333 ) );
  }
  float lit = smoothstep( -0.06, 0.1, ndl );
  float diffuse = max( ndl, 0.0 ) * lit;
  vec3 col = albedo * ( uSunI * diffuse * ( 1.0 - 0.45 * cloudShadow ) );
  // earthshine-style fill on the night side
  col += albedo * vec3( 0.55, 0.7, 1.0 ) * 0.05 + vec3( 0.002, 0.004, 0.009 );
  vec3 H = normalize( uSun + V );
  float spec = pow( max( dot( N, H ), 0.0 ), 220.0 ) * ocean * ( 1.0 - cloudShadow ) * lit;
  col += vec3( 1.0, 0.95, 0.85 ) * spec * uSunI * 0.3;
  float fres = pow( 1.0 - max( dot( N, V ), 0.0 ), 3.2 );
  col += vec3( 0.28, 0.52, 1.0 ) * fres * ( 0.1 + 0.9 * smoothstep( -0.3, 0.35, ndl ) ) * 1.5;
  gl_FragColor = vec4( col, uFade );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
const CLOUD_FRAG = `
uniform sampler2D tCloud;
uniform vec3 uSun;
uniform float uSpin;
uniform float uSunI;
uniform float uFade;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vec3 N = normalize( vN );
  float ndl = dot( N, uSun );
  vec3 c = texture2D( tCloud, vec2( vUv.x + uSpin, vUv.y ) ).rgb;
  float a = smoothstep( 0.1, 0.85, dot( c, vec3( 0.333 ) ) ) * 0.94 * uFade;
  float diffuse = max( ndl, 0.0 ) * smoothstep( -0.06, 0.1, ndl );
  vec3 col = vec3( 0.95 ) * ( uSunI * 0.9 * diffuse + 0.045 );
  gl_FragColor = vec4( col, a );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
// The shell is drawn from inside: brightest at the planet limb, fading to nothing at the shell edge.
const ATMO_FRAG = `
uniform vec3 uSun;
uniform float uLimb;
uniform float uFade;
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 N = normalize( vN );
  float nv = dot( N, normalize( vV ) );
  float t = smoothstep( 0.0, uLimb, - nv );
  float day = smoothstep( -0.35, 0.35, dot( N, uSun ) );
  vec3 col = vec3( 0.3, 0.55, 1.0 ) * pow( t, 2.2 ) * ( 0.1 + 0.9 * day ) * 1.2 * uFade;
  gl_FragColor = vec4( col, 1.0 );
  #include <colorspace_fragment>
}`
const ATMO_RADIUS = 1.07
const CLOUD_RADIUS = 1.012
const EARTH_FALLBACK = 0x2f6fb4
const DECOR_TILT = 0.41 // axis tilt of the picture when no orientation data is available
const orientScratch = new THREE.Matrix4()

export interface EarthRig {
  root: THREE.Group
  planet: THREE.Mesh
  clouds: THREE.Mesh
  atmosphere: THREE.Mesh
  hint: THREE.Mesh
  /** Shared by the planet, clouds and atmosphere: 0 (gone) to 1 (fully shown). */
  fade: { value: number }
}

export interface EarthOptions {
  baseUrl: string
  anisotropy: number
  /** False on the low tier: the cloud layer stays off and its image is never fetched. */
  clouds: boolean
  /** Called after a texture arrives, so the scene can redraw. */
  onTexture: () => void
  /** True once the scene is gone; late textures are then freed at once. */
  isDisposed: () => boolean
}

function placeholderTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  t.needsUpdate = true
  return t
}

/**
 * Earth sphere, a separate cloud layer and an atmosphere shell, lit from the real Sun direction.
 * Textures are NASA Blue Marble images served with the app; until they load (or if they fail) the
 * planet is a plain blue sphere. The orientation is set by `orientEarth`; until then it is a decorative tilt.
 */
export function buildEarth(opts: EarthOptions): EarthRig {
  const sunI = { value: 2.8 }
  const sun = { value: new THREE.Vector3(0, 1, 0) }
  const spin = { value: 0 }
  const fade = { value: 1 }
  const sphere = new THREE.SphereGeometry(1, 64, 32)

  const planetMat = new THREE.ShaderMaterial({
    uniforms: {
      tDay: { value: placeholderTexture() },
      tCloud: { value: placeholderTexture() },
      uSun: sun,
      uSpin: spin,
      uSunI: sunI,
      uFade: fade,
      uHasTex: { value: 0 },
      uFallback: { value: new THREE.Color(EARTH_FALLBACK) },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
  })
  const planet = new THREE.Mesh(sphere, planetMat)
  planet.name = 'earth-disc'

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { tCloud: { value: placeholderTexture() }, uSun: sun, uSpin: spin, uSunI: sunI, uFade: fade },
    vertexShader: EARTH_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
  })
  const clouds = new THREE.Mesh(sphere, cloudMat)
  clouds.scale.setScalar(CLOUD_RADIUS)
  clouds.visible = false
  clouds.name = 'earth-clouds'

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(ATMO_RADIUS, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: { uSun: sun, uFade: fade, uLimb: { value: Math.sqrt(1 - 1 / (ATMO_RADIUS * ATMO_RADIUS)) } },
      vertexShader: EARTH_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  )
  atmosphere.name = 'earth-atmosphere'

  const root = new THREE.Group()
  root.add(planet, clouds, atmosphere)
  for (const m of [planet, clouds, atmosphere]) m.frustumCulled = false
  root.rotation.z = DECOR_TILT

  const load = (file: string, srgb: boolean, apply: (tex: THREE.Texture) => void) => {
    new THREE.TextureLoader().load(
      `${opts.baseUrl}textures/earth/${file}`,
      (tex) => {
        if (opts.isDisposed()) {
          tex.dispose()
          return
        }
        tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
        tex.wrapS = THREE.RepeatWrapping
        tex.anisotropy = opts.anisotropy
        apply(tex)
        opts.onTexture()
      },
      undefined,
      () => {
        // Keep the plain-colour sphere.
      },
    )
  }
  // The 1x1 placeholders are freed when the real image replaces them.
  const swap = (u: Record<string, THREE.IUniform>, name: string, tex: THREE.Texture) => {
    ;(u[name].value as THREE.Texture).dispose()
    u[name].value = tex
  }
  load('land_ocean_ice_1024.jpg', true, (tex) => {
    swap(planetMat.uniforms, 'tDay', tex)
    planetMat.uniforms.uHasTex.value = 1
  })
  if (opts.clouds) {
    load('cloud_combined_1024.jpg', false, (tex) => {
      swap(cloudMat.uniforms, 'tCloud', tex)
      swap(planetMat.uniforms, 'tCloud', tex)
      clouds.visible = true
    })
  }

  const hint = buildHint(new THREE.Vector3(0.34, 0.58, 1.0))
  return { root, planet, clouds, atmosphere, hint, fade }
}

/** `sunDir` is the Sun direction (three.js axes) the lit side faces; `spinTurns` is the picture's turn in 0..1. */
export function setEarthLighting(rig: EarthRig, sunDir: THREE.Vector3 | null, spinTurns: number): void {
  const u = (rig.planet.material as THREE.ShaderMaterial).uniforms
  if (sunDir) (u.uSun.value as THREE.Vector3).copy(sunDir)
  u.uSpin.value = spinTurns
}

/** Applies a row-major 3x3 rotation (scene axes) from `earthRotation`; null restores the decorative tilt. */
export function orientEarth(rig: EarthRig, m: readonly number[] | null): void {
  if (m) {
    orientScratch.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1)
    rig.root.quaternion.setFromRotationMatrix(orientScratch)
  } else {
    rig.root.rotation.set(0, 0, DECOR_TILT)
  }
}

export function placeEarth(rig: EarthRig, p: BodyPlacement, fx: BodyFx = FX_FULL): void {
  const on = Boolean(p.dir) && fx.opacity > FADE_OFF
  rig.root.visible = on
  rig.fade.value = fx.opacity
  ;(rig.planet.material as THREE.ShaderMaterial).transparent = fx.opacity < 1
  if (on && p.dir) {
    rig.root.position.copy(p.dir).multiplyScalar(SKY_DIST_M)
    rig.root.scale.setScalar(SKY_DIST_M * Math.sin(p.angRadiusDeg * DEG) * fx.scale)
  }
  placeHint(rig.hint, p.hintDir, p.dir ? horizonGlowStrength(p.clearanceDeg, p.angRadiusDeg) * (1 - fx.opacity) : 0)
}

// Far-horizon skirt

const SKIRT_VERT = `
attribute float aAz;
varying float vAz;
void main() {
  vAz = aAz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`
// Colour is in display space so that it can match the haze on the terrain patch.
const SKIRT_FRAG = `
uniform vec3 uColor;
uniform float uSunAz;
uniform float uSunLit;
varying float vAz;
void main() {
  float lit = max( cos( vAz - uSunAz ), 0.0 ) * uSunLit;
  gl_FragColor = vec4( uColor * ( 0.8 + 1.5 * lit ), 1.0 );
}`

export interface SkirtRig {
  mesh: THREE.Mesh
}

export function buildSkirt(color: THREE.Vector3, segments: number): SkirtRig {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((segments + 1) * 6), 3))
  const az = new Float32Array((segments + 1) * 2)
  for (let i = 0; i <= segments; i++) az[i * 2] = az[i * 2 + 1] = (i / segments) * 2 * Math.PI
  geo.setAttribute('aAz', new THREE.BufferAttribute(az, 1))
  const idx: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geo.setIndex(idx)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uSunAz: { value: 0 }, uSunLit: { value: 0 } },
    vertexShader: SKIRT_VERT,
    fragmentShader: SKIRT_FRAG,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.name = 'horizon-skirt'
  return { mesh }
}

export function setSkirtProfile(rig: SkirtRig, profile: Float32Array): void {
  const attr = rig.mesh.geometry.getAttribute('position') as THREE.BufferAttribute
  attr.array.set(skirtPositions(profile, SKIRT_RADIUS_M))
  attr.needsUpdate = true
}

/** Sun azimuth and elevation in degrees (null when unknown): the far terrain facing the Sun is a little brighter. */
export function setSkirtSun(rig: SkirtRig, azDeg: number, elDeg: number | null): void {
  const u = (rig.mesh.material as THREE.ShaderMaterial).uniforms
  u.uSunAz.value = azDeg * DEG
  u.uSunLit.value = elDeg === null ? 0 : Math.max(0, Math.min(1, (elDeg + 1) / 6))
}
