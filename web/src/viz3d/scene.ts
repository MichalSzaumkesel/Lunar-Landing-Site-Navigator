import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useAppStore } from '../state/store'
import { Decor } from './decor'
import type { DecorHost } from './decor'
import { buildLander, buildLanderEnvironment, buildMarkerRing, disposeObject, LANDER_SINK_M } from './lander'
import type { OffsetM } from './landerHelpers'
import {
  BENCHMARK_FRAMES,
  BENCHMARK_SKIP_FRAMES,
  isLower,
  medianMs,
  parseTierOverride,
  TIERS,
  tierForIntervalMs,
} from './quality'
import type { QualityTier, TierSettings } from './quality'
import { CASCADE_PATCH_OK, createSharedUniforms, installPatches } from './shaderPatches'
import { SKIRT_SEGMENTS, skirtElevationAt, skirtProfile } from './skirt'
import {
  buildEarth,
  buildMilkyWay,
  buildSkirt,
  buildStars,
  buildSun,
  faceSunGlow,
  placeEarth,
  placeSun,
  orientEarth,
  setEarthLighting,
  setSkirtProfile,
  setSkirtSun,
  setStarSun,
  setSunGlare,
} from './skyBodies'
import type { BodyPlacement } from './skyBodies'
import { earthRotation } from '../lib/earthOrientation'
import type { EarthOrientation } from '../lib/earthOrientation'
import { buildTerrainMesh, directionEnu, heightAt } from './terrain'
import { makeMilkyWayTexture, makeRegolithTexture } from './textures'
import { earthLitFraction, faceTarget } from './viewMath'

/**
 * Frame mapping, the only place it is defined.
 * Terrain data is ENU metres: x east, y north, z up.
 * three.js is y up and right-handed, so ENU (x, y, z) becomes three (x, z, -y):
 * east stays +x, up becomes +y, north becomes -z (south is +z, towards the default overview camera).
 * It is a proper rotation, so triangle winding and normals carry over unchanged.
 */
export function enuToThree(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y]
}

/** Convert a packed ENU xyz array (positions or normals) to three.js order. */
function enuArrayToThree(src: Float32Array): Float32Array {
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    out[i] = src[i]
    out[i + 1] = src[i + 2]
    out[i + 2] = -src[i + 1]
  }
  return out
}

/** Unit vector towards (azimuth from north clockwise, elevation) in three.js coordinates. */
function dirThree(azDeg: number, elDeg: number): THREE.Vector3 {
  const [x, y, z] = directionEnu(azDeg, elDeg)
  const [tx, ty, tz] = enuToThree(x, y, z)
  return new THREE.Vector3(tx, ty, tz)
}

export type ViewMode = 'surface' | 'overview'

export interface TerrainInput {
  heights: Float32Array
  sizePx: number
  spacingM: number
}

export interface SkyState {
  /** Null when the cursor is outside the ephemeris. */
  sun: { az: number; el: number } | null
  earth: { az: number; el: number } | null
  sunAngRadiusDeg: number
  earthAngRadiusDeg: number
  /** Sun and Earth size slider: 1 is the true angular size. */
  sizeScale: number
  /** Cursor time, drives the decorative turn of the Earth picture when no orientation data is used. */
  timeMs: number
  /** Real Earth orientation at the cursor time; null keeps the decorative turn. */
  earthOrientation: EarthOrientation | null
  /** Site latitude in degrees: the lunar axis direction in the local sky depends on it. */
  siteLatDeg: number
}

const SUN_INTENSITY = 3.2 // about albedo * cos(incidence) before tone mapping
const EARTHSHINE_MAX = 0.3 // Earth light on the Moon at full Earth, relative units
const AMBIENT = 0.035
const FAR_M = 200_000
const SURFACE_FOV = 60
const OVERVIEW_FOV = 45
const STAND_OFF_M = 14 // the camera stands this far from the lander so the lander is in view
const PITCH_LIMIT = 80
const FACE_MS = 800
const HINT_RAISE_DEG = 0.9
const DAY_MS = 86_400_000
const DECOR_DEBOUNCE_MS = 140
const REGOLITH_COLOR = 0x8d8c89
const HAZE_MAX = 0.7
const HAZE_DISPLAY = new THREE.Vector3(0.085, 0.088, 0.1)

/** Three.js scene of one landing site. Renders on demand: call `invalidate()` after any change. */
export interface ShadowUpdateDecisionInput {
  hasLastShadow: boolean
  angleDeg: number
  playing: boolean
  timeSinceLastUpdateMs: number
}

/**
 * Pure decision helper for 3D shadow map update throttling.
 */
export function shouldUpdateShadow(input: ShadowUpdateDecisionInput): boolean {
  if (!input.hasLastShadow) {
    return true
  }
  if (!input.playing) {
    // a manual change when paused always updates
    return input.angleDeg > 1e-6
  }
  // while Play is running: at least 0.1 deg AND at most every 100 ms
  return input.angleDeg >= 0.1 && input.timeSinceLastUpdateMs >= 100
}

/** Pure easing function (ease-in-out cubic) for cinematic camera panning. */
export function cameraEase(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2
}

export interface SceneStats {
  tier: QualityTier
  /** Milliseconds spent generating procedural textures at startup. */
  textureMs: number
  decorInstances: number
  geometries: number
  textures: number
}

export class SurfaceScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(SURFACE_FOV, 1.6, 0.5, FAR_M)
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly data: TerrainInput
  private readonly sunFar = new THREE.DirectionalLight(0xfff2dc, 0)
  private readonly sunNear = new THREE.DirectionalLight(0xfff2dc, 0)
  private readonly earthLight = new THREE.DirectionalLight(0xa6c6ff, 0)
  private readonly sky = new THREE.Group()
  private readonly shared = createSharedUniforms()
  private readonly envTarget: THREE.WebGLRenderTarget
  private readonly lander: THREE.Group
  private readonly sunRig = buildSun(true)
  private readonly earthRig: ReturnType<typeof buildEarth>
  private readonly skirt = buildSkirt(HAZE_DISPLAY.clone(), SKIRT_SEGMENTS)
  private readonly terrainMat: THREE.MeshStandardMaterial
  private readonly landerFoil: THREE.MeshStandardMaterial[] = []
  private readonly decor: Decor
  private readonly override: QualityTier | null
  private tier: QualityTier
  private stars: THREE.Points
  private milkyWay: THREE.Mesh
  private textureMs = 0
  private terrain: THREE.Mesh | null = null
  private ring: THREE.Mesh | null = null
  private bounds = new THREE.Box3()

  private mode: ViewMode = 'surface'
  private exaggeration = 1
  private eyeHeightM = 2
  private yawDeg = 0 // azimuth the camera looks at (from north, clockwise)
  private pitchDeg = 4
  private standE = 0
  private standN = -STAND_OFF_M
  private sunDir: THREE.Vector3 | null = null
  private lastShadowSunDir: THREE.Vector3 | null = null
  private lastShadowUpdateTime = 0
  private lastSky: SkyState | null = null
  private mask: readonly number[] = []
  private maskStepDeg = 0.5
  private raf = 0
  private hoverRaf = 0
  private animationRaf = 0
  private landerAnimationCancel: (() => void) | null = null
  private benchRaf = 0
  private decorTimer = 0
  private cameraAnimationRaf = 0
  private cameraAnimationCancel: (() => void) | null = null
  private disposed = false
  private drag: { id: number; x: number; y: number } | null = null
  private pointerDownPos: { x: number; y: number; time: number } | null = null
  private landerOffset = { eastM: 0, northM: 0 }
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerVec = new THREE.Vector2()
  private onTerrainClick: ((coords: { eastM: number; northM: number; heightM: number }) => void) | null = null
  private onTerrainHover: ((coords: { eastM: number; northM: number; heightM: number } | null) => void) | null = null
  private onUserLook: (() => void) | null = null

  constructor(container: HTMLElement, data: TerrainInput) {
    this.data = data
    this.override = parseTierOverride(window.location.search, window.location.hash)
    this.tier = this.override ?? 'high'
    const tier = TIERS[this.tier]

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatioCap))
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.5
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.shadowMap.needsUpdate = true
    // r187 removed PCFSoftShadowMap; PCFShadowMap is its filtered replacement.
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.canvas = this.renderer.domElement
    this.canvas.style.touchAction = 'none'
    this.canvas.tabIndex = 0
    container.appendChild(this.canvas)

    this.scene.background = new THREE.Color(0x000000)
    this.scene.add(this.camera)

    // Textures first: they are the startup cost we measure.
    const t0 = performance.now()
    this.shared.uDetail.value = makeRegolithTexture(tier.detailTexSize, tier.anisotropy)
    const milkyTex = makeMilkyWayTexture(tier.milkyWay[0], tier.milkyWay[1])
    this.textureMs = performance.now() - t0

    // Materials with the shadow, regolith and haze patches.
    const patch = (m: THREE.MeshStandardMaterial) => installPatches(m, this.shared, 'prop', CASCADE_PATCH_OK)
    this.terrainMat = new THREE.MeshStandardMaterial({ color: REGOLITH_COLOR, roughness: 1, metalness: 0, dithering: true })
    installPatches(this.terrainMat, this.shared, 'terrain', CASCADE_PATCH_OK)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 })
    patch(rockMat)
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x9a968f, roughness: 1, metalness: 0 })
    patch(rimMat)

    // Light: the Sun twice (a high-resolution zone around the lander and the whole patch), a faint
    // Earth light and a flat ambient term so shadows are not pitch black.
    for (const [light, size] of [
      [this.sunNear, tier.nearShadowMap],
      [this.sunFar, tier.farShadowMap],
    ] as const) {
      light.castShadow = CASCADE_PATCH_OK || light === this.sunFar
      light.shadow.mapSize.set(size, size)
      light.shadow.bias = -0.0004
      light.shadow.radius = 1.6
    }
    this.scene.add(this.sunNear, this.sunNear.target, this.sunFar, this.sunFar.target, this.earthLight)
    this.scene.add(new THREE.AmbientLight(0x9aa6c0, AMBIENT * SUN_INTENSITY))
    this.shared.uNearR.value = tier.nearRadiusM

    // Sky: everything here follows the camera, so it stays at infinity.
    this.stars = buildStars(tier.stars, this.renderer.getPixelRatio())
    this.milkyWay = buildMilkyWay(milkyTex)
    this.earthRig = buildEarth({
      baseUrl: import.meta.env.BASE_URL,
      anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy()),
      onTexture: this.invalidate,
      isDisposed: () => this.disposed,
    })
    setSunGlare(this.sunRig, tier.glare)
    setSkirtProfile(this.skirt, skirtProfile([], 0.5))
    this.sky.add(
      this.milkyWay,
      this.stars,
      this.skirt.mesh,
      this.sunRig.root,
      this.sunRig.hint,
      this.earthRig.root,
      this.earthRig.hint,
    )
    this.scene.add(this.sky)

    this.envTarget = buildLanderEnvironment(this.renderer)
    this.lander = buildLander({ env: this.envTarget.texture, patch })
    this.scene.add(this.lander)
    this.lander.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
      if (mat?.envMap) this.landerFoil.push(mat)
    })

    this.decor = new Decor(rockMat, rimMat)
    this.scene.add(this.decor.group)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03
    this.controls.minDistance = 100
    this.controls.maxDistance = 60_000
    this.controls.enabled = false
    this.controls.addEventListener('change', this.invalidate)
    this.controls.addEventListener('start', this.onControlsStart)

    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: true })
    this.canvas.addEventListener('keydown', this.onKeyDown)

    this.rebuildTerrain()
    this.rebuildDecor()
    this.applyMode()
    this.setSize(container.clientWidth || 640, container.clientHeight || 400)
    if (!this.override) this.startBenchmark()
  }

  // Public API

  readonly invalidate = (): void => {
    if (this.raf || this.disposed) return
    this.raf = requestAnimationFrame(this.frame)
  }

  setSize(width: number, height: number): void {
    if (this.disposed || width < 1 || height < 1) return
    this.renderer.setSize(width, height, false)
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  setExaggeration(k: number): void {
    if (k === this.exaggeration) return
    this.exaggeration = k
    this.rebuildTerrain()
    this.rebuildDecor()
    this.placeLander()
    this.applyCamera()
    this.fitShadows()
    this.renderer.shadowMap.needsUpdate = true
    this.invalidate()
  }

  setEyeHeight(m: number): void {
    this.eyeHeightM = m
    this.applyCamera()
    this.invalidate()
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode) return
    this.mode = mode
    this.applyMode()
    this.invalidate()
  }

  /**
   * Horizon mask of the site (elevation in degrees per azimuth step, index 0 at north, clockwise).
   * It drives the far-horizon skirt and the Sun light. For a lander moved away from the site this
   * is approximate; the terrain patch itself already occludes locally.
   */
  setHorizon(mask: readonly number[], azStepDeg: number): void {
    this.mask = mask
    this.maskStepDeg = azStepDeg
    setSkirtProfile(this.skirt, skirtProfile(mask, azStepDeg))
    if (this.lastSky) this.setSky(this.lastSky)
    else this.invalidate()
  }

  /** Called when the user turns the view by hand (drag or arrow keys). */
  setOnUserLook(cb: (() => void) | null): void {
    this.onUserLook = cb
  }

  /** Point the surface camera at an azimuth and stand off so that the lander is in view. */
  lookAtAzimuth(azDeg: number): void {
    const a = ((azDeg + 30) * Math.PI) / 180
    this.standE = -STAND_OFF_M * Math.sin(a)
    this.standN = -STAND_OFF_M * Math.cos(a)
    this.yawDeg = azDeg + 10
    this.pitchDeg = 4
    this.applyCamera()
    this.invalidate()
  }

  /** Turn the surface camera towards a direction without moving it. */
  faceDirection(azDeg: number, elDeg: number): void {
    this.cancelCameraAnimation()
    const t = faceTarget(azDeg, elDeg)
    this.yawDeg = t.azimuthDeg
    this.pitchDeg = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, t.pitchDeg))
    this.applyCamera()
    this.invalidate()
  }

  /** Animated turn to show a body: see `faceTarget` for how the pitch is chosen. */
  faceBody(target: { azimuthDeg: number; pitchDeg: number }): Promise<void> {
    return this.cameraTo({ azimuthDeg: target.azimuthDeg, elevationDeg: target.pitchDeg, durationMs: FACE_MS })
  }

  /**
   * Smoothly pans the camera to target azimuth and elevation.
   * Eased, cancelled by any user input, no animation under prefers-reduced-motion.
   */
  cameraTo(target: { azimuthDeg: number; elevationDeg: number; durationMs: number }): Promise<void> {
    this.cancelCameraAnimation()

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    const targetYaw = (((target.azimuthDeg % 360) + 360) % 360)
    const targetPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, target.elevationDeg))

    if (prefersReducedMotion || target.durationMs <= 0) {
      this.yawDeg = targetYaw
      this.pitchDeg = targetPitch
      this.applyCamera()
      this.invalidate()
      return Promise.resolve()
    }

    const startYaw = (((this.yawDeg % 360) + 360) % 360)
    const dYaw = ((((targetYaw - startYaw) % 360) + 540) % 360) - 180
    const startPitch = this.pitchDeg
    const dPitch = targetPitch - startPitch

    return new Promise<void>((resolve) => {
      this.cameraAnimationCancel = () => {
        resolve()
      }

      const startTime = performance.now()
      const step = (now: number) => {
        const elapsed = now - startTime
        const rawT = Math.min(1, elapsed / target.durationMs)
        const ease = cameraEase(rawT)

        this.yawDeg = (((startYaw + dYaw * ease) % 360) + 360) % 360
        this.pitchDeg = startPitch + dPitch * ease
        this.applyCamera()
        this.invalidate()

        if (rawT < 1 && !this.disposed) {
          this.cameraAnimationRaf = requestAnimationFrame(step)
        } else {
          this.cameraAnimationRaf = 0
          this.cameraAnimationCancel = null
          resolve()
        }
      }

      this.cameraAnimationRaf = requestAnimationFrame(step)
    })
  }

  cancelCameraAnimation(): void {
    if (this.cameraAnimationRaf) {
      cancelAnimationFrame(this.cameraAnimationRaf)
      this.cameraAnimationRaf = 0
    }
    if (this.cameraAnimationCancel) {
      const cb = this.cameraAnimationCancel
      this.cameraAnimationCancel = null
      cb()
    }
  }

  cancelLanderAnimation(): void {
    if (this.animationRaf) {
      cancelAnimationFrame(this.animationRaf)
      this.animationRaf = 0
    }
    if (this.landerAnimationCancel) {
      const cb = this.landerAnimationCancel
      this.landerAnimationCancel = null
      cb()
    }
  }

  /** Force an unthrottled shadow update (e.g. on playback pause). */
  invalidateShadow(): void {
    if (!this.sunDir) return
    this.fitShadows()
    this.renderer.shadowMap.needsUpdate = true
    this.lastShadowSunDir = this.sunDir.clone()
    this.lastShadowUpdateTime = performance.now()
    this.invalidate()
  }

  setSky(s: SkyState): void {
    this.lastSky = s
    const k = Math.max(1, s.sizeScale)
    const sunP = this.placement(s.sun, s.sunAngRadiusDeg * k)
    const earthP = this.placement(s.earth, s.earthAngRadiusDeg * k)

    let sunShare = 0
    if (s.sun && sunP.dir) {
      this.sunDir = sunP.dir
      // Light fades out as the disc sinks behind the horizon mask (visible share of the true disc).
      const ang = Math.max(s.sunAngRadiusDeg, 1e-3)
      const visible = Math.max(0, Math.min(1, (sunP.clearanceDeg + ang) / (2 * ang)))
      sunShare = visible
      const intensity = SUN_INTENSITY * visible
      this.sunFar.intensity = intensity
      this.sunNear.intensity = intensity

      const playing = useAppStore.getState().playing
      const now = performance.now()
      let angleDeg = 0
      if (this.lastShadowSunDir) {
        const dot = Math.max(-1, Math.min(1, this.sunDir.dot(this.lastShadowSunDir)))
        angleDeg = (Math.acos(dot) * 180) / Math.PI
      }

      const shouldUpdate = shouldUpdateShadow({
        hasLastShadow: Boolean(this.lastShadowSunDir),
        angleDeg,
        playing,
        timeSinceLastUpdateMs: now - this.lastShadowUpdateTime,
      })

      if (shouldUpdate) {
        this.fitShadows()
        this.renderer.shadowMap.needsUpdate = true
        this.lastShadowSunDir = this.sunDir.clone()
        this.lastShadowUpdateTime = now
      }
    } else {
      this.sunDir = null
      this.lastShadowSunDir = null
      this.sunFar.intensity = 0
      this.sunNear.intensity = 0
    }
    if (!CASCADE_PATCH_OK) this.sunNear.intensity = 0
    // The foil's ground-bounce reflection follows the Sun: dark when the Sun is hidden.
    for (const m of this.landerFoil) m.envMapIntensity = 0.08 + 0.92 * sunShare

    // Earth light on the terrain: strongest for a full Earth, none while it is behind the horizon.
    let earthShine = 0
    if (s.sun && s.earth && earthP.clearanceDeg >= -s.earthAngRadiusDeg) {
      const lit = earthLitFraction(directionEnu(s.sun.az, s.sun.el), directionEnu(s.earth.az, s.earth.el))
      earthShine = EARTHSHINE_MAX * lit
    }
    this.earthLight.intensity = earthShine
    if (earthP.dir) this.earthLight.position.copy(earthP.dir).multiplyScalar(1000)

    const rotation =
      s.earth && s.earthOrientation
        ? earthRotation(s.siteLatDeg, s.earth.az, s.earth.el, s.earthOrientation)
        : null
    orientEarth(this.earthRig, rotation)
    setEarthLighting(this.earthRig, this.sunDir, rotation ? 0 : (s.timeMs / DAY_MS) % 1)
    setStarSun(this.stars, this.sunDir)
    setSkirtSun(this.skirt, s.sun?.az ?? 0, s.sun?.el ?? null)
    placeSun(this.sunRig, sunP)
    placeEarth(this.earthRig, earthP)
    this.invalidate()
  }

  setOnTerrainClick(
    cb: ((coords: { eastM: number; northM: number; heightM: number }) => void) | null,
  ): void {
    this.onTerrainClick = cb
  }

  setOnTerrainHover(
    cb: ((coords: { eastM: number; northM: number; heightM: number } | null) => void) | null,
  ): void {
    this.onTerrainHover = cb
  }

  setLanderOffset(eastM: number, northM: number): void {
    if (this.landerOffset.eastM === eastM && this.landerOffset.northM === northM) return
    this.landerOffset = { eastM, northM }
    const x = eastM
    const z = -northM
    this.placeLander()
    this.updateMarkerRing()
    this.scheduleDecor()
    if (this.mode === 'surface') {
      this.applyCamera()
    } else {
      this.controls.target.set(x, this.groundY(x, z), z)
    }
    this.fitShadows()
    this.renderer.shadowMap.needsUpdate = true
    this.lastShadowUpdateTime = performance.now()
    this.invalidate()
  }

  animateLanderTo(target: OffsetM, durationMs: number = 1200): Promise<void> {
    this.cancelLanderAnimation()

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    if (prefersReducedMotion || durationMs <= 0) {
      this.setLanderOffset(target.eastM, target.northM)
      return Promise.resolve()
    }

    const startEast = this.landerOffset.eastM
    const startNorth = this.landerOffset.northM
    const dEast = target.eastM - startEast
    const dNorth = target.northM - startNorth

    if (Math.hypot(dEast, dNorth) < 1) {
      this.setLanderOffset(target.eastM, target.northM)
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      this.landerAnimationCancel = () => {
        resolve()
      }

      const startTime = performance.now()

      const step = (now: number) => {
        if (this.disposed) {
          this.animationRaf = 0
          this.landerAnimationCancel = null
          resolve()
          return
        }

        const elapsed = now - startTime
        const rawT = Math.min(1, elapsed / durationMs)
        const ease = cameraEase(rawT)

        const curEast = startEast + dEast * ease
        const curNorth = startNorth + dNorth * ease

        this.setLanderOffset(curEast, curNorth)

        if (rawT < 1 && !this.disposed) {
          this.animationRaf = requestAnimationFrame(step)
        } else {
          this.animationRaf = 0
          this.landerAnimationCancel = null
          if (!this.disposed) {
            this.setLanderOffset(target.eastM, target.northM)
          }
          resolve()
        }
      }

      this.animationRaf = requestAnimationFrame(step)
    })
  }

  setHeatmapTexture(texture: THREE.Texture | null): void {
    if (this.terrainMat.map && texture && this.terrainMat.map !== texture) {
      this.terrainMat.map.dispose()
    }
    if (texture) {
      this.terrainMat.map = texture
      this.terrainMat.color.set(0xffffff)
    } else {
      this.terrainMat.map = null
      this.terrainMat.color.set(REGOLITH_COLOR)
    }
    this.terrainMat.needsUpdate = true
    this.invalidate()
  }

  raycastTerrain(
    clientX: number,
    clientY: number,
  ): { eastM: number; northM: number; heightM: number } | null {
    if (!this.terrain) return null
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    this.pointerVec.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointerVec.y = -((clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointerVec, this.camera)
    const hits = this.raycaster.intersectObject(this.terrain, false)
    if (hits.length === 0) return null
    const p = hits[0].point
    const eastM = p.x
    const northM = -p.z
    const heightM = p.y / this.exaggeration
    return { eastM, northM, heightM }
  }

  /** Quality tier in use, texture generation time, decoration count and GPU resource counts. */
  stats(): SceneStats {
    const mem = this.renderer.info.memory
    return {
      tier: this.tier,
      textureMs: this.textureMs,
      decorInstances: this.decor.instanceCount,
      geometries: mem.geometries,
      textures: mem.textures,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelCameraAnimation()
    this.cancelLanderAnimation()
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf)
    this.hoverRaf = 0
    if (this.animationRaf) cancelAnimationFrame(this.animationRaf)
    this.animationRaf = 0
    if (this.benchRaf) cancelAnimationFrame(this.benchRaf)
    this.benchRaf = 0
    window.clearTimeout(this.decorTimer)
    this.controls.removeEventListener('change', this.invalidate)
    this.controls.removeEventListener('start', this.onControlsStart)
    this.controls.dispose()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('keydown', this.onKeyDown)
    disposeObject(this.scene)
    this.shared.uDetail.value?.dispose()
    this.envTarget.dispose()
    if (this.terrainMat.map) {
      this.terrainMat.map.dispose()
      this.terrainMat.map = null
    }
    this.terrainMat.dispose()
    for (const l of [this.sunNear, this.sunFar]) {
      l.shadow.map?.dispose()
      l.shadow.dispose()
    }
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }

  // Quality

  /**
   * Judge the machine from the first normal frame intervals. Forcing GPU reads stalls the page
   * for seconds, so the benchmark only observes the frames the user already sees. The first
   * frames pay for shader compilation and are skipped.
   */
  private startBenchmark(): void {
    const intervals: number[] = []
    let last = performance.now()
    let count = 0
    const tick = (now: number) => {
      this.benchRaf = 0
      if (this.disposed) return
      const dt = now - last
      last = now
      count++
      if (count > BENCHMARK_SKIP_FRAMES) intervals.push(dt)
      if (intervals.length < BENCHMARK_FRAMES) {
        this.benchRaf = requestAnimationFrame(tick)
        return
      }
      const next = tierForIntervalMs(medianMs(intervals))
      if (isLower(next, this.tier)) this.applyTier(next)
    }
    this.benchRaf = requestAnimationFrame(tick)
  }

  private applyTier(tier: QualityTier): void {
    this.tier = tier
    const t = TIERS[tier]
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, t.pixelRatioCap))
    this.setSize(this.canvas.clientWidth, this.canvas.clientHeight)
    for (const [light, size] of [
      [this.sunNear, t.nearShadowMap],
      [this.sunFar, t.farShadowMap],
    ] as const) {
      light.shadow.mapSize.set(size, size)
      light.shadow.map?.dispose()
      light.shadow.map = null
    }
    this.shared.uNearR.value = t.nearRadiusM
    this.shared.uDetail.value?.dispose()
    this.shared.uDetail.value = makeRegolithTexture(t.detailTexSize, t.anisotropy)
    this.sky.remove(this.stars, this.milkyWay)
    disposeObject(this.stars)
    disposeObject(this.milkyWay)
    this.stars = buildStars(t.stars, this.renderer.getPixelRatio())
    this.milkyWay = buildMilkyWay(makeMilkyWayTexture(t.milkyWay[0], t.milkyWay[1]))
    this.sky.add(this.stars, this.milkyWay)
    setSunGlare(this.sunRig, t.glare)
    this.rebuildDecor()
    if (this.lastSky) this.setSky(this.lastSky)
    this.fitShadows()
    this.renderer.shadowMap.needsUpdate = true
    this.invalidate()
  }

  // Terrain

  private groundY(x: number, z: number): number {
    const { heights, sizePx, spacingM } = this.data
    return (heightAt(heights, sizePx, spacingM, x, -z) ?? 0) * this.exaggeration
  }

  private rebuildTerrain(): void {
    const { heights, sizePx, spacingM } = this.data
    const m = buildTerrainMesh(heights, sizePx, spacingM, this.exaggeration)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(enuArrayToThree(m.positions), 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(enuArrayToThree(m.normals), 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2))
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1))
    geo.computeBoundingSphere()

    if (this.terrain) {
      this.terrain.geometry.dispose()
      this.terrain.geometry = geo
    } else {
      this.terrain = new THREE.Mesh(geo, this.terrainMat)
      this.terrain.receiveShadow = true
      this.terrain.castShadow = true
      this.terrain.name = 'terrain'
      this.scene.add(this.terrain)
    }

    // Shadow volume bounds: whole patch plus the lander.
    const half = (sizePx / 2) * spacingM
    this.bounds.set(
      new THREE.Vector3(-half, m.zMin - 1, -half),
      new THREE.Vector3(half, m.zMax + 6, half),
    )

    this.placeLander()
    this.updateMarkerRing()
  }

  /** Stand the lander on the ground at its offset, tilted to the local surface, feet sunk a little. */
  private placeLander(): void {
    const x = this.landerOffset.eastM
    const z = -this.landerOffset.northM
    const d = 1.5
    const slopeX = (this.groundY(x + d, z) - this.groundY(x - d, z)) / (2 * d)
    const slopeZ = (this.groundY(x, z + d) - this.groundY(x, z - d)) / (2 * d)
    const normal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize()
    this.lander.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal)
    this.lander.position.set(x, this.groundY(x, z), z).addScaledVector(normal, -LANDER_SINK_M)
    this.shared.uNearC.value.set(x, z)
  }

  private scheduleDecor(): void {
    window.clearTimeout(this.decorTimer)
    this.decorTimer = window.setTimeout(() => {
      if (this.disposed) return
      this.rebuildDecor()
      this.invalidate()
    }, DECOR_DEBOUNCE_MS)
  }

  private rebuildDecor(): void {
    const { sizePx, spacingM } = this.data
    const host: DecorHost = { groundY: (x, z) => this.groundY(x, z), halfExtentM: (sizePx / 2) * spacingM }
    this.decor.update(this.landerOffset.eastM, this.landerOffset.northM, TIERS[this.tier], host)
  }

  private updateMarkerRing(): void {
    const { eastM, northM } = this.landerOffset
    const x0 = eastM
    const z0 = -northM
    if (!this.ring) {
      this.ring = buildMarkerRing((rx, rz) => this.groundY(rx + x0, rz + z0))
      this.ring.position.set(x0, 0, z0)
      this.ring.visible = this.mode === 'overview'
      this.scene.add(this.ring)
      return
    }
    this.ring.position.set(x0, 0, z0)
    this.ring.visible = this.mode === 'overview'
    if (this.ring.visible) {
      const posAttr = this.ring.geometry.getAttribute('position') as THREE.BufferAttribute
      const pos = posAttr.array as Float32Array
      const segments = 96
      const innerR = 230
      const outerR = 260
      const lift = 2
      for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2
        const c = Math.cos(a)
        const s = Math.sin(a)
        for (let k = 0; k < 2; k++) {
          const r = k === 0 ? innerR : outerR
          const o = (i * 2 + k) * 3
          pos[o + 1] = this.groundY(c * r + x0, s * r + z0) + lift
        }
      }
      posAttr.needsUpdate = true
    }
  }

  /** Body placement with its clearance over the horizon mask at its azimuth. */
  private placement(pos: { az: number; el: number } | null, angRadiusDeg: number): BodyPlacement {
    if (!pos) return { dir: null, elDeg: 0, hintDir: null, clearanceDeg: 0, angRadiusDeg }
    const horizon = skirtElevationAt(this.mask, this.maskStepDeg, pos.az)
    return {
      dir: dirThree(pos.az, pos.el),
      elDeg: pos.el,
      hintDir: dirThree(pos.az, horizon + HINT_RAISE_DEG),
      clearanceDeg: pos.el - horizon,
      angRadiusDeg,
    }
  }

  // Sun shadow: orthographic frustums fitted in light space, one for the whole patch and one around the lander.

  private fitShadows(): void {
    const dir = this.sunDir
    if (!dir) return
    this.fitLight(this.sunFar, this.bounds, this.tierSettings().farShadowMap)
    if (!CASCADE_PATCH_OK) return
    const r = this.shared.uNearR.value
    const c = this.shared.uNearC.value
    let lo = Infinity
    let hi = -Infinity
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const y = this.groundY(c.x + (i / 4) * r, c.y + (j / 4) * r)
        lo = Math.min(lo, y)
        hi = Math.max(hi, y)
      }
    }
    const box = new THREE.Box3(
      new THREE.Vector3(c.x - r, lo - 2, c.y - r),
      new THREE.Vector3(c.x + r, hi + 8, c.y + r),
    )
    this.fitLight(this.sunNear, box, this.tierSettings().nearShadowMap)
  }

  private tierSettings(): TierSettings {
    return TIERS[this.tier]
  }

  private fitLight(light: THREE.DirectionalLight, box: THREE.Box3, mapSize: number): void {
    const dir = this.sunDir
    if (!dir) return
    const center = box.getCenter(new THREE.Vector3())
    light.position.copy(center).addScaledVector(dir, 30_000)
    light.target.position.copy(center)
    light.updateMatrixWorld()
    light.target.updateMatrixWorld()

    const cam = light.shadow.camera
    cam.position.copy(light.position)
    cam.lookAt(center)
    cam.updateMatrixWorld()

    const { min, max } = box
    const v = new THREE.Vector3()
    let l = Infinity
    let r = -Infinity
    let b = Infinity
    let t = -Infinity
    let near = Infinity
    let far = -Infinity
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z)
      v.applyMatrix4(cam.matrixWorldInverse)
      l = Math.min(l, v.x)
      r = Math.max(r, v.x)
      b = Math.min(b, v.y)
      t = Math.max(t, v.y)
      near = Math.min(near, -v.z)
      far = Math.max(far, -v.z)
    }
    const pad = 0.01 * Math.max(r - l, t - b)
    cam.left = l - pad
    cam.right = r + pad
    cam.bottom = b - pad
    cam.top = t + pad
    cam.near = Math.max(1, near - 200)
    cam.far = far + 200
    cam.updateProjectionMatrix()

    // Bias scales with the texel size so grazing light (1 to 3 degrees) does not produce acne.
    const texel = (cam.right - cam.left) / mapSize
    light.shadow.normalBias = texel * 0.8
  }

  // Camera

  private applyMode(): void {
    const surface = this.mode === 'surface'
    this.controls.enabled = !surface
    if (this.ring) {
      this.ring.visible = !surface
      if (!surface) {
        this.updateMarkerRing()
      }
    }
    // The skirt is a wall around the observer; seen from the overview camera it would be a curtain.
    this.skirt.mesh.visible = surface
    // Haze is for a low observer; from the overview camera it would flatten the whole patch.
    this.shared.uHaze.value.z = surface ? HAZE_MAX : 0
    this.camera.fov = surface ? SURFACE_FOV : OVERVIEW_FOV
    this.camera.near = surface ? 0.5 : 5
    this.camera.updateProjectionMatrix()
    if (surface) {
      this.applyCamera()
    } else {
      const lx = this.landerOffset.eastM
      const lz = -this.landerOffset.northM
      this.camera.position.set(lx, 6000, lz + 8000)
      this.controls.target.set(lx, this.groundY(lx, lz), lz)
      this.camera.lookAt(lx, this.groundY(lx, lz), lz)
      this.controls.update()
    }
  }

  private applyCamera(): void {
    if (this.mode !== 'surface') return
    const x = this.standE + this.landerOffset.eastM
    const z = -this.standN - this.landerOffset.northM
    this.camera.position.set(x, this.groundY(x, z) + this.eyeHeightM, z)
    const yaw = (this.yawDeg * Math.PI) / 180
    const pitch = (this.pitchDeg * Math.PI) / 180
    const dx = Math.sin(yaw) * Math.cos(pitch)
    const dy = Math.sin(pitch)
    const dz = -Math.cos(yaw) * Math.cos(pitch)
    this.camera.lookAt(x + dx, this.camera.position.y + dy, z + dz)
  }

  private look(dYaw: number, dPitch: number): void {
    this.yawDeg = (((this.yawDeg + dYaw) % 360) + 360) % 360
    this.pitchDeg = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitchDeg + dPitch))
    this.applyCamera()
    this.onUserLook?.()
    this.invalidate()
  }

  private readonly onControlsStart = (): void => {
    this.cancelCameraAnimation()
    this.cancelLanderAnimation()
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.cancelCameraAnimation()
    this.cancelLanderAnimation()
    this.pointerDownPos = { x: e.clientX, y: e.clientY, time: performance.now() }
    if (this.mode !== 'surface') return
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
    this.canvas.setPointerCapture(e.pointerId)
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    const d = this.drag
    if (d && d.id === e.pointerId) {
      this.cancelCameraAnimation()
      // Grab-style drag: the world follows the pointer.
      const degPerPx = SURFACE_FOV / Math.max(1, this.canvas.clientHeight)
      this.look(-(e.clientX - d.x) * degPerPx, (e.clientY - d.y) * degPerPx)
      d.x = e.clientX
      d.y = e.clientY
      return
    }

    if (this.onTerrainHover) {
      if (this.hoverRaf) return
      this.hoverRaf = requestAnimationFrame(() => {
        this.hoverRaf = 0
        if (this.disposed || !this.onTerrainHover) return
        const hit = this.raycastTerrain(e.clientX, e.clientY)
        this.onTerrainHover(hit)
      })
    }
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.drag?.id === e.pointerId) {
      this.drag = null
      try {
        this.canvas.releasePointerCapture(e.pointerId)
      } catch {
        // pointer capture was already released
      }
    }

    if (this.pointerDownPos) {
      const dx = e.clientX - this.pointerDownPos.x
      const dy = e.clientY - this.pointerDownPos.y
      const dt = performance.now() - this.pointerDownPos.time
      this.pointerDownPos = null
      if (Math.hypot(dx, dy) < 6 && dt < 400) {
        const hit = this.raycastTerrain(e.clientX, e.clientY)
        if (hit && this.onTerrainClick) {
          this.onTerrainClick(hit)
        }
      }
    }
  }

  private readonly onPointerLeave = (): void => {
    if (this.onTerrainHover) {
      this.onTerrainHover(null)
    }
  }

  private readonly onWheel = (): void => {
    this.cancelCameraAnimation()
    this.cancelLanderAnimation()
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.cancelCameraAnimation()
    this.cancelLanderAnimation()
    if (this.mode !== 'surface') return
    const step = e.shiftKey ? 15 : 5
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    this.look(m[0], m[1])
  }

  // Render

  private renderOnce(): void {
    // OrbitControls damping: update() fires 'change' (and so schedules another frame) until it settles.
    if (this.mode === 'overview') this.controls.update()
    this.sky.position.copy(this.camera.position)
    faceSunGlow(this.sunRig, this.camera.quaternion)
    this.renderer.render(this.scene, this.camera)
  }

  private readonly frame = (): void => {
    this.raf = 0
    if (this.disposed) return
    this.renderOnce()
  }
}
