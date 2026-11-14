import { useEffect, useRef, type FC } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Site, SiteCategory } from '../../lib/types'
import type { MarkerTip } from './MarkerTooltip'
import { cameraPositionFor, ease, globeToLatLon, latLonToGlobe, slerpDir, type V3 } from './globeMath'

export interface SubPoint {
  lat_deg: number
  lon_deg: number
}

export interface GlobeViewProps {
  sites: Site[]
  selectedSiteIds: string[]
  activeSiteId: string | null
  imageUrl: string | null
  /** Point directly under the Sun at the time cursor (null: no ephemeris, neutral light). */
  subSolar: SubPoint | null
  /** Point directly under the Earth at the time cursor. */
  subEarth: SubPoint | null
  pickMode: boolean
  onSelectSite(id: string, shiftKey?: boolean): void
  onPickPoint(lat: number, lon: number): void
  /** Tooltip anchor in px relative to the globe container, or null to hide. */
  onTip(tip: MarkerTip | null): void
}

const FOV = 30
const START_DIST = 4.2
const MIN_DIST = 1.45
const MAX_DIST = 9
const MARKER_PX = 22 // sprite size on screen (glyph + selection ring)
const SURFACE = 1.004 // marker radius (just above the surface)
// Linear light levels; with sRGB output an ambient of 0.07 still shows the relief on the night side
const SUN_INTENSITY = 3.0
const NIGHT_AMBIENT = 0.07
const FALLBACK_COLORS: Record<SiteCategory, string> = {
  apollo: '#4ea3ff',
  clps: '#3ddc97',
  commercial: '#c58cff',
  international: '#ff8a4c',
  artemis_region: '#ffc233',
  custom: '#ff6b9a',
}

const round1 = (x: number) => Math.round(x * 10) / 10

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim()
  return v || fallback
}

/** Canvas glyph per category, same shapes as markerGlyphs.tsx (circle, square, diamond, triangle, hexagon, plus). */
function glyphTexture(category: SiteCategory, color: string, bg: string, focus: string, active: boolean, selected: boolean): THREE.CanvasTexture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const k = S / MARKER_PX // canvas px per screen px
  g.translate(S / 2, S / 2)
  g.scale(k, k)
  if (selected) {
    g.beginPath()
    g.arc(0, 0, 8.5, 0, Math.PI * 2)
    g.strokeStyle = active ? focus : color
    g.lineWidth = 1.5
    g.stroke()
  }
  g.beginPath()
  switch (category) {
    case 'apollo':
    case 'custom':
      g.arc(0, 0, 5, 0, Math.PI * 2)
      break
    case 'clps':
      g.rect(-4.5, -4.5, 9, 9)
      break
    case 'commercial':
      g.moveTo(0, -5.5); g.lineTo(5.5, 0); g.lineTo(0, 5.5); g.lineTo(-5.5, 0); g.closePath()
      break
    case 'international':
      g.moveTo(0, -5.5); g.lineTo(5.2, 4); g.lineTo(-5.2, 4); g.closePath()
      break
    case 'artemis_region':
      g.moveTo(0, -5.5); g.lineTo(4.8, -2.75); g.lineTo(4.8, 2.75); g.lineTo(0, 5.5); g.lineTo(-4.8, 2.75); g.lineTo(-4.8, -2.75); g.closePath()
      break
  }
  g.fillStyle = active ? color : bg
  g.fill()
  g.strokeStyle = active ? focus : color
  g.lineWidth = 1.5
  g.stroke()
  if (category === 'custom') {
    g.beginPath()
    g.moveTo(-3, 0); g.lineTo(3, 0); g.moveTo(0, -3); g.lineTo(0, 3)
    g.strokeStyle = active ? bg : color
    g.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function earthTexture(): THREE.CanvasTexture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  g.translate(S / 2, S / 2)
  g.beginPath()
  g.arc(0, 0, 22, 0, Math.PI * 2)
  g.strokeStyle = 'rgba(120, 190, 255, 0.95)'
  g.lineWidth = 4
  g.setLineDash([7, 5])
  g.stroke()
  g.setLineDash([])
  g.beginPath()
  g.arc(0, 0, 8, 0, Math.PI * 2)
  g.fillStyle = 'rgba(80, 160, 255, 0.95)'
  g.fill()
  g.strokeStyle = '#ffffff'
  g.lineWidth = 2
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

interface Engine {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  globe: THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>
  sun: THREE.DirectionalLight
  ambient: THREE.AmbientLight
  markers: THREE.Group
  earth: THREE.Sprite
  setEarthOn(on: boolean): void
  requestRender(): void
  flyTo(lat: number, lon: number, dist?: number): void
  dispose(): void
}

export const GlobeView: FC<GlobeViewProps> = (props) => {
  const { sites, selectedSiteIds, activeSiteId, imageUrl, subSolar, subEarth, pickMode } = props
  const hostRef = useRef<HTMLDivElement | null>(null)
  const engineRef = useRef<Engine | null>(null)
  const propsRef = useRef(props)
  useEffect(() => {
    propsRef.current = props
  })

  // Scene setup / teardown (once)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.domElement.className = 'globe-view__canvas'
    host.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(FOV, 2, 0.05, 50)
    const site0 = propsRef.current.sites.find((s) => s.id === propsRef.current.activeSiteId)
    camera.position.set(...cameraPositionFor(site0?.lat_deg ?? 0, site0?.lon_deg ?? 0, START_DIST))
    camera.lookAt(0, 0, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.minDistance = MIN_DIST
    controls.maxDistance = MAX_DIST
    controls.rotateSpeed = 0.55
    controls.zoomSpeed = 0.8

    const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 96), new THREE.MeshLambertMaterial({ color: 0xffffff }))
    scene.add(globe)
    const ambient = new THREE.AmbientLight(0xffffff, NIGHT_AMBIENT)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, SUN_INTENSITY)
    scene.add(sun)
    const markers = new THREE.Group()
    scene.add(markers)
    const earthMat = new THREE.SpriteMaterial({ map: earthTexture(), depthTest: true, transparent: true })
    const earth = new THREE.Sprite(earthMat)
    earth.visible = false
    earth.renderOrder = 1
    scene.add(earth)

    let frame = 0
    let earthOn = false
    let anim: { from: V3; to: V3; d0: number; d1: number; t0: number } | null = null

    const sizeSprites = () => {
      const h = renderer.domElement.clientHeight || 1
      const perPx = (2 * Math.tan((FOV * Math.PI) / 360)) / h
      const scaleAt = (obj: THREE.Object3D, px: number) => {
        const d = camera.position.distanceTo(obj.position)
        obj.scale.set(px * perPx * d, px * perPx * d, 1)
      }
      // a surface point p is in view only if the camera is above its local horizon: c·p > |p|²
      const c = camera.position
      const facing = (o: THREE.Object3D) => c.dot(o.position) > o.position.lengthSq()
      markers.children.forEach((m) => {
        m.visible = facing(m)
        scaleAt(m, MARKER_PX)
      })
      earth.visible = earthOn && facing(earth)
      scaleAt(earth, 26)
    }

    const render = () => {
      frame = 0
      if (anim) {
        const t = Math.min(1, (performance.now() - anim.t0) / 700)
        const k = ease(t)
        const dir = slerpDir(anim.from, anim.to, k)
        const d = anim.d0 + (anim.d1 - anim.d0) * k
        const n = Math.hypot(...dir) || 1
        camera.position.set((dir[0] / n) * d, (dir[1] / n) * d, (dir[2] / n) * d)
        camera.lookAt(0, 0, 0)
        if (t >= 1) anim = null
      }
      const moving = controls.update()
      sizeSprites()
      renderer.render(scene, camera)
      if (anim || moving) requestRender()
    }
    const requestRender = () => {
      if (!frame) frame = requestAnimationFrame(render)
    }
    controls.addEventListener('change', requestRender)

    const flyTo = (lat: number, lon: number, dist?: number) => {
      const d0 = camera.position.length()
      const to = cameraPositionFor(lat, lon, 1)
      const p = camera.position
      anim = { from: [p.x / d0, p.y / d0, p.z / d0], to, d0, d1: dist ?? Math.min(d0, START_DIST), t0: performance.now() }
      requestRender()
    }

    const resize = () => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      requestRender()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    // Hover (raycast) + click / pick
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hitAt = (clientX: number, clientY: number) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, camera)
      const hits = ray.intersectObjects([globe, ...markers.children.filter((m) => m.visible)], false)
      const ground = hits.find((h) => h.object === globe)
      // a marker counts only if it is in front of the globe surface along this ray
      const marker = hits.find((h) => h.object !== globe && (!ground || h.distance <= ground.distance + 0.01))
      return { ground, marker }
    }
    const tipFor = (obj: THREE.Object3D): MarkerTip | null => {
      const site = propsRef.current.sites.find((s) => s.id === obj.userData.siteId)
      if (!site) return null
      const v = obj.position.clone().project(camera)
      const r = renderer.domElement.getBoundingClientRect()
      return { site, x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height }
    }
    let hovered: THREE.Object3D | null = null
    let down: { x: number; y: number } | null = null
    let dragging = false
    let moveFrame = 0
    let lastMove: PointerEvent | null = null
    const onMove = (e: PointerEvent) => {
      lastMove = e
      if (moveFrame) return
      moveFrame = requestAnimationFrame(() => {
        moveFrame = 0
        const ev = lastMove
        if (!ev || dragging) return
        const { marker } = hitAt(ev.clientX, ev.clientY)
        const obj = marker?.object ?? null
        renderer.domElement.style.cursor = propsRef.current.pickMode ? 'crosshair' : obj ? 'pointer' : 'grab'
        if (obj !== hovered) {
          hovered = obj
          propsRef.current.onTip(obj ? tipFor(obj) : null)
        }
      })
    }
    const onLeave = () => {
      hovered = null
      propsRef.current.onTip(null)
    }
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      const d = down
      down = null
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return
      const { ground, marker } = hitAt(e.clientX, e.clientY)
      const p = propsRef.current
      if (p.pickMode) {
        if (ground) {
          const ll = globeToLatLon([ground.point.x, ground.point.y, ground.point.z])
          p.onPickPoint(round1(ll.lat), round1(ll.lon))
        }
        return
      }
      if (marker) p.onSelectSite(marker.object.userData.siteId as string, e.shiftKey)
    }
    const onStart = () => {
      dragging = true
      hovered = null
      propsRef.current.onTip(null)
    }
    const onEnd = () => {
      dragging = false
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)
    const el = renderer.domElement
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    const disposeMarkers = () => {
      for (const m of markers.children as THREE.Sprite[]) {
        m.material.map?.dispose()
        m.material.dispose()
      }
      markers.clear()
    }

    engineRef.current = {
      renderer, scene, camera, controls, globe, sun, ambient, markers, earth, requestRender, flyTo,
      setEarthOn: (on: boolean) => {
        earthOn = on
      },
      dispose: () => {
        cancelAnimationFrame(frame)
        cancelAnimationFrame(moveFrame)
        ro.disconnect()
        controls.removeEventListener('change', requestRender)
        controls.removeEventListener('start', onStart)
        controls.removeEventListener('end', onEnd)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerleave', onLeave)
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
        controls.dispose()
        disposeMarkers()
        earthMat.map?.dispose()
        earthMat.dispose()
        globe.material.map?.dispose()
        globe.material.dispose()
        globe.geometry.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
        el.remove()
      },
    }
    return () => {
      engineRef.current?.dispose()
      engineRef.current = null
      propsRef.current.onTip(null)
    }
  }, [])

  // Basemap texture
  useEffect(() => {
    const eng = engineRef.current
    if (!eng || !imageUrl) return
    let cancelled = false
    new THREE.TextureLoader().load(imageUrl, (tex) => {
      if (cancelled) {
        tex.dispose()
        return
      }
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = Math.min(8, eng.renderer.capabilities.getMaxAnisotropy())
      eng.globe.material.map?.dispose()
      eng.globe.material.map = tex
      eng.globe.material.needsUpdate = true
      eng.requestRender()
    })
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  // Sun light + Earth-facing indicator
  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    if (subSolar) {
      eng.sun.position.set(...latLonToGlobe(subSolar.lat_deg, subSolar.lon_deg)).multiplyScalar(10)
      eng.sun.intensity = SUN_INTENSITY
      eng.ambient.intensity = NIGHT_AMBIENT
    } else {
      // no ephemeris at the cursor: even, neutral light from the camera side
      eng.sun.position.copy(eng.camera.position).multiplyScalar(10)
      eng.sun.intensity = 1.2
      eng.ambient.intensity = 1.2
    }
    if (subEarth) {
      eng.earth.position.set(...latLonToGlobe(subEarth.lat_deg, subEarth.lon_deg)).multiplyScalar(SURFACE)
      eng.setEarthOn(true)
    } else {
      eng.setEarthOn(false)
    }
    eng.requestRender()
  }, [subSolar, subEarth])

  // Markers
  useEffect(() => {
    const eng = engineRef.current
    const host = hostRef.current
    if (!eng || !host) return
    for (const m of eng.markers.children as THREE.Sprite[]) {
      m.material.map?.dispose()
      m.material.dispose()
    }
    eng.markers.clear()
    const bg = cssVar(host, '--bg', '#0b0e16')
    const focus = cssVar(host, '--focus', '#ffffff')
    for (const site of sites) {
      const color = cssVar(host, `--cat-${site.category}`, FALLBACK_COLORS[site.category] ?? '#cccccc')
      const active = site.id === activeSiteId
      const mat = new THREE.SpriteMaterial({
        map: glyphTexture(site.category, color, bg, focus, active, selectedSiteIds.includes(site.id)),
        depthTest: true,
        transparent: true,
      })
      const sp = new THREE.Sprite(mat)
      sp.position.set(...latLonToGlobe(site.lat_deg, site.lon_deg)).multiplyScalar(SURFACE)
      sp.userData.siteId = site.id
      sp.renderOrder = active ? 3 : 2
      eng.markers.add(sp)
    }
    eng.requestRender()
  }, [sites, selectedSiteIds, activeSiteId])

  useEffect(() => {
    const eng = engineRef.current
    if (eng) eng.renderer.domElement.style.cursor = pickMode ? 'crosshair' : 'grab'
  }, [pickMode])

  const activeSite = sites.find((s) => s.id === activeSiteId) ?? null

  return (
    <div
      ref={hostRef}
      className="globe-view"
      data-subsolar={subSolar ? `${subSolar.lat_deg.toFixed(2)},${subSolar.lon_deg.toFixed(2)}` : undefined}
      data-subearth={subEarth ? `${subEarth.lat_deg.toFixed(2)},${subEarth.lon_deg.toFixed(2)}` : undefined}
      role="region"
      aria-label="3D globe of the Moon with landing sites. Drag to rotate, scroll to zoom. The Flat map lists every site for keyboard use."
    >
      <div className="globe-view__tools">
        <button type="button" onClick={() => engineRef.current?.flyTo(-90, 0, 3.2)} title="Turn the globe to the south pole">
          Focus south pole
        </button>
        <button
          type="button"
          disabled={!activeSite}
          onClick={() => activeSite && engineRef.current?.flyTo(activeSite.lat_deg, activeSite.lon_deg, 2.6)}
          title="Turn the globe to the active site"
        >
          Focus active site
        </button>
      </div>
      {subEarth && (
        <div className="globe-view__earth-chip" title="Centre of the Earth-facing side (sub-Earth point at the time cursor). Ignoring terrain, the Earth is above the horizon everywhere on the hemisphere around this point.">
          <span className="globe-view__earth-icon" aria-hidden="true" />
          Earth-facing side (centre)
        </div>
      )}
      {!subSolar && <div className="globe-view__note">Sun position not available at this time: neutral lighting</div>}
    </div>
  )
}

export default GlobeView
