import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useAppStore } from '../state/store'
import { buildLander, buildMarkerRing, disposeObject } from './lander'
import type { OffsetM } from './landerHelpers'
import { buildBodies, buildStars, MAGNIFY, placeBody, setEarthSun } from './skyBodies'
import { buildTerrainMesh, directionEnu, heightAt } from './terrain'

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
  magnify: boolean
}

const SUN_INTENSITY = 3.2 // about albedo * cos(incidence) with no tone mapping
const EARTHSHINE = 0.02 // fraction of the full Sun, as a flat ambient term
const SHADOW_MAP = 2048
const FAR_M = 200_000
const SURFACE_FOV = 60
const OVERVIEW_FOV = 45
const STAND_OFF_M = 14 // the camera stands this far from the lander so the lander is in view
const PITCH_LIMIT = 80

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

export class SurfaceScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(SURFACE_FOV, 1.6, 0.5, FAR_M)
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly data: TerrainInput
  private readonly sunLight = new THREE.DirectionalLight(0xffffff, 0)
  private readonly sky = new THREE.Group()
  private readonly lander = buildLander()
  private readonly sunDisc: THREE.Mesh
  private readonly earthDisc: THREE.Mesh
  private readonly terrainMat = new THREE.MeshStandardMaterial({
    color: 0x9a9892,
    roughness: 1,
    metalness: 0,
  })
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
  private raf = 0
  private hoverRaf = 0
  private animationRaf = 0
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

  constructor(container: HTMLElement, data: TerrainInput) {
    this.data = data
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setClearColor(0x000000, 1)
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

    // Light: the Sun, plus a flat earthshine term so shadows are not pitch black.
    const sl = this.sunLight
    sl.castShadow = true
    sl.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP)
    sl.shadow.bias = -0.0004
    this.scene.add(sl, sl.target)
    this.scene.add(new THREE.AmbientLight(0xffffff, EARTHSHINE * SUN_INTENSITY))

    // Sky: stars and the two discs follow the camera, so they stay at infinity.
    const bodies = buildBodies()
    this.sunDisc = bodies.sun
    this.earthDisc = bodies.earth
    this.sky.add(buildStars(), this.sunDisc, this.earthDisc)
    this.scene.add(this.sky)

    this.scene.add(this.lander)

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
    this.applyMode()
    this.setSize(container.clientWidth || 640, container.clientHeight || 400)
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
    this.applyCamera()
    this.fitShadow()
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
    this.yawDeg = azDeg
    this.pitchDeg = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, elDeg + 3))
    this.applyCamera()
    this.invalidate()
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

  /** Force an unthrottled shadow update (e.g. on playback pause). */
  invalidateShadow(): void {
    if (!this.sunDir) return
    this.fitShadow()
    this.renderer.shadowMap.needsUpdate = true
    this.lastShadowSunDir = this.sunDir.clone()
    this.lastShadowUpdateTime = performance.now()
    this.invalidate()
  }

  setSky(s: SkyState): void {
    const k = s.magnify ? MAGNIFY : 1
    if (s.sun) {
      this.sunDir = dirThree(s.sun.az, s.sun.el)
      this.sunLight.intensity = s.sun.el < 0 ? 0 : SUN_INTENSITY

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
        this.fitShadow()
        this.renderer.shadowMap.needsUpdate = true
        this.lastShadowSunDir = this.sunDir.clone()
        this.lastShadowUpdateTime = now
      }
    } else {
      this.sunDir = null
      this.lastShadowSunDir = null
      this.sunLight.intensity = 0
    }
    setEarthSun(this.earthDisc, this.sunDir)
    placeBody(this.sunDisc, this.sunDir, s.sun?.el ?? 0, s.sunAngRadiusDeg, k)
    placeBody(
      this.earthDisc,
      s.earth ? dirThree(s.earth.az, s.earth.el) : null,
      s.earth?.el ?? 0,
      s.earthAngRadiusDeg,
      k,
    )
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
    this.lander.position.set(x, this.groundY(x, z), z)
    this.updateMarkerRing()
    if (this.mode === 'surface') {
      this.applyCamera()
    } else {
      this.controls.target.set(x, this.groundY(x, z), z)
    }
    this.invalidate()
  }

  animateLanderTo(target: OffsetM, durationMs: number = 1200): Promise<void> {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

    if (prefersReducedMotion || durationMs <= 0) {
      this.setLanderOffset(target.eastM, target.northM)
      return Promise.resolve()
    }

    if (this.animationRaf) {
      cancelAnimationFrame(this.animationRaf)
      this.animationRaf = 0
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
      const startTime = performance.now()

      const step = (now: number) => {
        const elapsed = now - startTime
        const rawT = Math.min(1, elapsed / durationMs)
        // ease in-out cubic
        const ease =
          rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2

        const curEast = startEast + dEast * ease
        const curNorth = startNorth + dNorth * ease

        this.setLanderOffset(curEast, curNorth)

        if (rawT < 1 && !this.disposed) {
          this.animationRaf = requestAnimationFrame(step)
        } else {
          this.animationRaf = 0
          this.setLanderOffset(target.eastM, target.northM)
          resolve()
        }
      }

      this.animationRaf = requestAnimationFrame(step)
    })
  }

  setHeatmapTexture(texture: THREE.Texture | null): void {
    if (this.terrainMat.map) {
      this.terrainMat.map.dispose()
      this.terrainMat.map = null
    }
    if (texture) {
      this.terrainMat.map = texture
      this.terrainMat.color.set(0xffffff)
    } else {
      this.terrainMat.color.set(0x9a9892)
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

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelCameraAnimation()
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    if (this.hoverRaf) cancelAnimationFrame(this.hoverRaf)
    this.hoverRaf = 0
    if (this.animationRaf) cancelAnimationFrame(this.animationRaf)
    this.animationRaf = 0
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
    if (this.terrainMat.map) {
      this.terrainMat.map.dispose()
      this.terrainMat.map = null
    }
    this.terrainMat.dispose()
    this.sunLight.shadow.map?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
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

    // Lander stands on the ground at current offset.
    const lx = this.landerOffset.eastM
    const lz = -this.landerOffset.northM
    this.lander.position.set(lx, this.groundY(lx, lz), lz)

    this.updateMarkerRing()
  }

  private updateMarkerRing(): void {
    if (this.ring) {
      this.scene.remove(this.ring)
      disposeObject(this.ring)
      this.ring = null
    }
    const { eastM, northM } = this.landerOffset
    const x0 = eastM
    const z0 = -northM
    this.ring = buildMarkerRing((rx, rz) => this.groundY(rx + x0, rz + z0))
    this.ring.position.set(x0, 0, z0)
    this.ring.visible = this.mode === 'overview'
    this.scene.add(this.ring)
  }

  // Sun shadow: orthographic frustum fitted to the terrain box in light space.

  private fitShadow(): void {
    const dir = this.sunDir
    if (!dir) return
    const light = this.sunLight
    const center = this.bounds.getCenter(new THREE.Vector3())
    light.position.copy(center).addScaledVector(dir, 30_000)
    light.target.position.copy(center)
    light.updateMatrixWorld()
    light.target.updateMatrixWorld()

    const cam = light.shadow.camera
    cam.position.copy(light.position)
    cam.lookAt(center)
    cam.updateMatrixWorld()

    const { min, max } = this.bounds
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
    const texel = (cam.right - cam.left) / SHADOW_MAP
    light.shadow.normalBias = texel * 0.8
  }

  // Camera

  private applyMode(): void {
    const surface = this.mode === 'surface'
    this.controls.enabled = !surface
    if (this.ring) this.ring.visible = !surface
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
    this.invalidate()
  }

  private readonly onControlsStart = (): void => {
    this.cancelCameraAnimation()
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.cancelCameraAnimation()
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
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.cancelCameraAnimation()
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

  private readonly frame = (): void => {
    this.raf = 0
    if (this.disposed) return
    // OrbitControls damping: update() fires 'change' (and so schedules another frame) until it settles.
    if (this.mode === 'overview') this.controls.update()
    this.sky.position.copy(this.camera.position)
    this.renderer.render(this.scene, this.camera)
  }
}
