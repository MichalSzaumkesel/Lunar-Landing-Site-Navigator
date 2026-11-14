import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { registerActiveScene } from '../components/demo/cameraControl'
import { describeBody, fmtNum, fmtUtc, pickMask, sunStateText } from '../components/sky/geometry'
import { sampleAt } from '../lib/ephem'
import { earthIlluminatedFraction } from '../lib/earthPhase'
import { earthOrientationAt, loadEarthOrientation } from '../lib/earthOrientation'
import type { EarthOrientationFile } from '../lib/earthOrientation'
import { horizonAt } from '../lib/horizon'
import type { SiteBundle, TerrainFile } from '../lib/types'
import { useScenarioMetrics } from '../lib/useScenarioMetrics'
import { useSiteBundle } from '../lib/useSiteBundle'
import { scenarioCursorMs, scenarioWindowMs } from '../state/selectors'
import { useAppStore } from '../state/store'
import type { Scenario } from '../state/types'
import { SurfaceScene } from './scene'
import type { SkyState, ViewMode } from './scene'
import { useThrottledCursorH } from './useThrottledCursorH'
import { heightAt } from './terrain'
import { horizonFromTerrain } from './terrainHorizon'
import { cancelLocalSunlitGrid, localSunlitGridAsync } from './localIllumClient'
import { cancelBestSpotSearch, findBestSpotAsync } from './bestSpotClient'
import { clampSearchRadius, formatResultSentence, formatSimpleResultSentence } from './bestSpot'
import type { BestSpotResult } from './bestSpot'
import { createHeatmapTexture } from './heatmapTexture'
import {
  cellIndexAt,
  clampLanderOffset,
  computeSunVisibleHours,
  formatDeltaHours,
  formatOffset,
  legendRange,
} from './landerHelpers'
import type { OffsetM } from './landerHelpers'
import { createKeyMotion } from './keyMotion'
import type { KeyMotion } from './keyMotion'
import { MOVE_MS } from './tween'
import { lockReducer } from './cameraLock'
import type { LockBody, LockState } from './cameraLock'
import { LockButton } from './LockButton'

/** Top speed of a held arrow key (metres per second) and the readout refresh interval while moving. */
const LANDER_M_PER_S = 400
const READOUT_MS = 100
import { usePresence } from '../lib/usePresence'
import { useTerrainHeights } from './useTerrainHeights'
import {
  belowHorizonText,
  faceTarget,
  OVERVIEW_FACE_MS,
  overviewFaceTarget,
  SIZE_MAX,
  SIZE_MIN,
  SIZE_STEP,
  sizeLabel,
  sizeValueText,
} from './viewMath'
import './surface.css'

const MAX_EXAGGERATION = 5

// The first-view hint shows once per session, then fades after a few seconds.
let lookHintShown = false

function LookHint() {
  const [open, setOpen] = useState(!lookHintShown)
  const { mounted, state } = usePresence(open)
  useEffect(() => {
    lookHintShown = true
    const t = setTimeout(() => setOpen(false), 4000)
    return () => clearTimeout(t)
  }, [])
  if (!mounted) return null
  return (
    <div className="surface__overlay surface__overlay--br surface__hint" data-state={state}>
      Drag to look around. Click terrain to move the lander.
    </div>
  )
}

function simpleSunText(visible: boolean, el: number): string {
  if (visible) return 'Sun visible'
  return el < 0 ? 'Sun below the horizon' : 'Sun hidden behind hills'
}

function faceTitle(body: 'Sun' | 'Earth' | 'lander', mode: ViewMode, hasSample: boolean): string {
  if (body === 'lander') return mode === 'overview' ? 'Centre the camera on the lander' : 'On the surface the camera is already at the lander'
  if (!hasSample) return `${body} direction is not available at this time`
  if (mode === 'overview') return `Orbit the camera to look towards the ${body}`
  return `Turn the camera towards the ${body}`
}

// The far horizon comes from the site's horizon mask until the lander is moved; then the local patch alone is used.
function Badges({ bundle, edgeWarning, moved }: { bundle: SiteBundle; edgeWarning?: boolean; moved: boolean }) {
  return (
    <div className="surface__badges">
      {bundle.synthetic && <span className="badge badge--synthetic">Synthetic data</span>}
      <span className="badge badge--approximate">
        {moved ? 'Approximate (local terrain patch horizon)' : 'Local terrain patch + horizon mask'}
      </span>
      {edgeWarning && <span className="badge badge--warn">Edge of the terrain data</span>}
    </div>
  )
}

export type SurfaceVariant = 'full' | 'simple'

interface StageProps {
  simple: boolean
  scenario: Scenario
  bundle: SiteBundle
  terrain: TerrainFile
  heights: Float32Array
}

function SurfaceStage({ simple, scenario, bundle, terrain, heights }: StageProps) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<SurfaceScene | null>(null)
  const [mode, setMode] = useState<ViewMode>('surface')
  const [exaggeration, setExaggeration] = useState(1)
  const [sizeScale, setSizeScale] = useState(SIZE_MIN)
  const [showCredits, setShowCredits] = useState(false)
  const [facing, setFacing] = useState<'sun' | 'earth' | null>(null)
  const [locked, setLocked] = useState<LockState>(null)

  // Lander movement and what-if state (local only, not in global store)
  const [landerOffset, setLanderOffset] = useState<OffsetM>({ eastM: 0, northM: 0 })
  const [isClamped, setIsClamped] = useState(false)

  // Sunlight heatmap state
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatmapGrid, setHeatmapGrid] = useState<Float32Array | null>(null)
  const [hoveredCell, setHoveredCell] = useState<{
    eastM: number
    northM: number
    pct: number
  } | null>(null)

  const heatmapLoading = showHeatmap && !heatmapGrid

  // Sunniest spot search state
  const [searchRadiusM, setSearchRadiusM] = useState<number>(1000)
  const [isSearching, setIsSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState(0)
  const [searchMessage, setSearchMessage] = useState<string | null>(null)
  const [bestSpotResult, setBestSpotResult] = useState<BestSpotResult | null>(null)
  const [dismissedResult, setDismissedResult] = useState<BestSpotResult | null>(null)
  const chipResult = bestSpotResult !== dismissedResult ? bestSpotResult : null
  const chipPresence = usePresence(chipResult !== null)
  const [showComparison, setShowComparison] = useState(false)

  // Readouts update about 10 times a second; the sky itself is pushed to the scene per frame below.
  const cursorH = useThrottledCursorH()
  const observerHeightM = useAppStore((s) => s.observerHeightM)
  const playing = useAppStore((s) => s.playing)
  const prevPlayingRef = useRef(playing)

  useEffect(() => {
    if (prevPlayingRef.current && !playing && scene) {
      scene.invalidateShadow()
    }
    prevPlayingRef.current = playing
  }, [playing, scene])

  const cursorMs = scenarioCursorMs(scenario, cursorH)
  const sample = useMemo(() => sampleAt(bundle.ephem, cursorMs), [bundle.ephem, cursorMs])
  const { startMs, endMs } = scenarioWindowMs(scenario)
  const cardMetrics = useScenarioMetrics(bundle, observerHeightM, startMs, endMs)
  const cardSunHours = cardMetrics ? (cardMetrics.pct_sunlit / 100) * ((endMs - startMs) / 3_600_000) : null

  // Clear cached heatmap and best spot search when scenario dates or observer height change
  const prevParamsRef = useRef({ startMs, endMs, observerHeightM })
  useEffect(() => {
    if (
      prevParamsRef.current.startMs !== startMs ||
      prevParamsRef.current.endMs !== endMs ||
      prevParamsRef.current.observerHeightM !== observerHeightM
    ) {
      prevParamsRef.current = { startMs, endMs, observerHeightM }
      setHeatmapGrid(null)
      setBestSpotResult(null)
      setSearchMessage(null)
    }
  }, [startMs, endMs, observerHeightM])

  const extentM = terrain.size_px * terrain.spacing_m
  // Sampling resolution targeting ~500 m cells (e.g. 41x41 on 20.48 km patch)
  const gridN = useMemo(() => Math.max(16, Math.min(64, Math.round(extentM / 500))), [extentM])
  const cellResolutionM = Math.round(extentM / gridN)

  // Derived heatmap legend range
  const heatmapRange = useMemo(
    () => (heatmapGrid ? legendRange(heatmapGrid) : { min: 0, max: 100 }),
    [heatmapGrid],
  )

  // Sun visible hours for original site vs moved lander
  const origMask = useMemo(() => {
    try {
      return horizonFromTerrain(heights, terrain.size_px, terrain.spacing_m, 0, 0, observerHeightM, {
        rays: 360,
      })
    } catch {
      return new Float32Array(360)
    }
  }, [heights, terrain.size_px, terrain.spacing_m, observerHeightM])
  const origSunHours = useMemo(
    () => computeSunVisibleHours(bundle.ephem, origMask, 1.0, startMs, endMs),
    [bundle.ephem, origMask, startMs, endMs],
  )

  // The horizon is rebuilt only once the lander rests, so dragging stays smooth.
  const [maskOffset, setMaskOffset] = useState<OffsetM>(landerOffset)
  useEffect(() => {
    const t = setTimeout(() => setMaskOffset(landerOffset), 120)
    return () => clearTimeout(t)
  }, [landerOffset])

  const movedMask = useMemo(() => {
    if (maskOffset.eastM === 0 && maskOffset.northM === 0) return origMask
    try {
      return horizonFromTerrain(
        heights,
        terrain.size_px,
        terrain.spacing_m,
        maskOffset.eastM,
        maskOffset.northM,
        observerHeightM,
        { rays: 360 },
      )
    } catch {
      return origMask
    }
  }, [heights, terrain.size_px, terrain.spacing_m, maskOffset, observerHeightM, origMask])

  const movedSunHours = useMemo(
    () => computeSunVisibleHours(bundle.ephem, movedMask, 1.0, startMs, endMs),
    [bundle.ephem, movedMask, startMs, endMs],
  )

  const deltaHours =
    origSunHours !== null && movedSunHours !== null ? movedSunHours - origSunHours : 0

  const landerHeight = useMemo(
    () =>
      heightAt(
        heights,
        terrain.size_px,
        terrain.spacing_m,
        landerOffset.eastM,
        landerOffset.northM,
      ) ?? 0,
    [heights, terrain.size_px, terrain.spacing_m, landerOffset],
  )

  // Focused cell readout at lander position for keyboard users
  const landerCell = useMemo(() => {
    if (!heatmapGrid) return null
    return cellIndexAt(landerOffset.eastM, landerOffset.northM, extentM, gridN)
  }, [heatmapGrid, landerOffset, extentM, gridN])
  const landerCellPct = landerCell && heatmapGrid ? heatmapGrid[landerCell.index] : null

  const [orientationFile, setOrientationFile] = useState<EarthOrientationFile | null>(null)
  useEffect(() => {
    let alive = true
    void loadEarthOrientation().then((f) => {
      if (alive) setOrientationFile(f)
    })
    return () => {
      alive = false
    }
  }, [])
  const earthOrientation = useMemo(
    () => (orientationFile ? earthOrientationAt(orientationFile, cursorMs) : null),
    [orientationFile, cursorMs],
  )

  // Built from a store time, not from React state, so Play does not re-render this component per frame.
  const buildSky = useCallback(
    (h: number): SkyState => {
      const ms = scenarioCursorMs(scenario, h)
      const at = sampleAt(bundle.ephem, ms)
      return {
        sun: at?.sun ?? null,
        earth: at?.earth ?? null,
        sunAngRadiusDeg: bundle.ephem.sun_ang_radius_deg,
        earthAngRadiusDeg: bundle.ephem.earth_ang_radius_deg,
        sizeScale,
        timeMs: ms,
        earthOrientation: orientationFile ? earthOrientationAt(orientationFile, ms) : null,
        siteLatDeg: bundle.site.lat_deg,
      }
    },
    [scenario, bundle, sizeScale, orientationFile],
  )
  const buildSkyRef = useRef(buildSky)
  useEffect(() => {
    buildSkyRef.current = buildSky
  }, [buildSky])

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const s = new SurfaceScene(holder, {
      heights,
      sizePx: terrain.size_px,
      spacingM: terrain.spacing_m,
    })
    s.lookAtAzimuth(buildSkyRef.current(useAppStore.getState().cursorH).sun?.az ?? 0)
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      s.setSize(width, height)
    })
    ro.observe(holder)
    setScene(s)
    return () => {
      ro.disconnect()
      s.dispose()
      setScene(null)
    }
  }, [heights, terrain.size_px, terrain.spacing_m])

  // Camera control hook for cinematic demo mode
  useEffect(() => {
    if (!scene) return
    return registerActiveScene(scene)
  }, [scene])

  const mask = useMemo(() => pickMask(bundle, observerHeightM), [bundle, observerHeightM])
  const azStepDeg = bundle.horizon.az_step_deg
  useEffect(() => scene?.setHorizon(mask, azStepDeg), [scene, mask, azStepDeg])
  useEffect(() => {
    scene?.setOnUserLook(() => setFacing(null))
    return () => scene?.setOnUserLook(null)
  }, [scene])

  const faceBody = (body: 'sun' | 'earth') => {
    const pos = body === 'sun' ? sample?.sun : sample?.earth
    if (!pos || !scene) return
    if (mode === 'overview') {
      const t = overviewFaceTarget(pos.az, scene.overviewElevationDeg())
      void scene.cameraTo({ ...t, durationMs: OVERVIEW_FACE_MS })
      return
    }
    setFacing(body)
    void scene.faceBody(faceTarget(pos.az, pos.el, horizonAt(mask, azStepDeg, pos.az)))
  }
  const lockBody = (body: LockBody) => {
    if (!scene) return
    setLocked((s) => lockReducer(s, { type: 'lock', body }))
    if (body === 'lander') {
      setFacing(null)
      scene.centerOnLander(true)
      return
    }
    const pos = body === 'sun' ? sample?.sun : sample?.earth
    if (!pos) return
    setFacing(mode === 'surface' ? body : null)
    scene.lockOnDirection(pos.az, pos.el)
  }
  const unlock = () => {
    scene?.clearLock()
    setLocked(null)
  }
  const faceLander = () => {
    setLocked(null)
    scene?.centerOnLander(false)
  }
  useEffect(() => {
    scene?.setOnLockBreak(() => setLocked(null))
    return () => scene?.setOnLockBreak(null)
  }, [scene])
  useEffect(() => {
    if (locked !== 'sun' && locked !== 'earth') return
    const pos = locked === 'sun' ? sample?.sun : sample?.earth
    if (pos) scene?.updateLockDirection(pos.az, pos.el)
  }, [scene, locked, sample])
  useEffect(() => {
    if (!locked) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      scene?.clearLock()
      setLocked(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scene, locked])
  const switchMode = (next: ViewMode) => {
    setMode(next)
    if (next === 'surface' && locked === 'lander') unlock()
  }
  const facingPos = facing === 'sun' ? sample?.sun : facing === 'earth' ? sample?.earth : null
  const facingTarget = facingPos
    ? faceTarget(facingPos.az, facingPos.el, horizonAt(mask, azStepDeg, facingPos.az))
    : null
  const facingNote =
    facing && facingTarget?.belowHorizon
      ? belowHorizonText(facing === 'sun' ? 'Sun' : 'Earth', facingTarget.belowDeg)
      : null

  useEffect(() => scene?.setMode(mode), [scene, mode])
  useEffect(() => scene?.setExaggeration(exaggeration), [scene, exaggeration])
  useEffect(() => scene?.setEyeHeight(observerHeightM), [scene, observerHeightM])
  useEffect(() => {
    if (!scene) return
    scene.setSky(buildSky(useAppStore.getState().cursorH))
    return useAppStore.subscribe((s, prev) => {
      if (s.cursorH !== prev.cursorH) scene.setSky(buildSky(s.cursorH))
    })
  }, [scene, buildSky])

  // Sync lander position with 3D scene
  useEffect(() => {
    scene?.setLanderOffset(landerOffset.eastM, landerOffset.northM)
  }, [scene, landerOffset])

  // Latest requested lander position (an animated move updates the state only when it ends).
  const targetOffsetRef = useRef<OffsetM>({ eastM: 0, northM: 0 })
  const moveSeqRef = useRef(0)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Animated lander move. The state (and with it the debounced horizon mask) follows after the move.
  const moveLanderTo = useCallback(
    async (offset: OffsetM, durationMs: number): Promise<boolean> => {
      const seq = ++moveSeqRef.current
      targetOffsetRef.current = offset
      if (!scene) {
        setLanderOffset(offset)
        return true
      }
      const r = await scene.animateLanderTo(offset, durationMs)
      // Superseded by a newer move, or unmounted: leave the state to the newer one.
      if (!mountedRef.current || seq !== moveSeqRef.current) return false
      setLanderOffset(r.finished ? offset : r.offset)
      if (!r.finished) targetOffsetRef.current = r.offset
      return r.finished
    },
    [scene],
  )

  // Raycast terrain click to move lander
  const handleTerrainClick = useCallback(
    (hit: { eastM: number; northM: number; heightM: number }) => {
      const clamped = clampLanderOffset(
        { eastM: Math.round(hit.eastM), northM: Math.round(hit.northM) },
        terrain.size_px,
        terrain.spacing_m,
      )
      void moveLanderTo(clamped.offset, MOVE_MS)
      setIsClamped(clamped.clamped)
      setBestSpotResult(null)
    },
    [terrain.size_px, terrain.spacing_m, moveLanderTo],
  )

  useEffect(() => {
    scene?.setOnTerrainClick(handleTerrainClick)
    return () => scene?.setOnTerrainClick(null)
  }, [scene, handleTerrainClick])

  // Raycast hover to inspect cells when heatmap is active
  const handleTerrainHover = useCallback(
    (hit: { eastM: number; northM: number; heightM: number } | null) => {
      if (!hit || !heatmapGrid) {
        setHoveredCell(null)
        return
      }
      const cell = cellIndexAt(hit.eastM, hit.northM, extentM, gridN)
      if (!cell) {
        setHoveredCell(null)
        return
      }
      const pct = heatmapGrid[cell.index]
      if (Number.isNaN(pct)) {
        setHoveredCell(null)
      } else {
        setHoveredCell({ eastM: hit.eastM, northM: hit.northM, pct })
      }
    },
    [heatmapGrid, extentM, gridN],
  )

  useEffect(() => {
    scene?.setOnTerrainHover(handleTerrainHover)
    return () => scene?.setOnTerrainHover(null)
  }, [scene, handleTerrainHover])

  // Heatmap texture sync with 3D scene (memoized to prevent GPU re-uploads when toggling)
  const heatmapTexture = useMemo(() => {
    if (!heatmapGrid) return null
    return createHeatmapTexture(heatmapGrid, gridN).texture
  }, [heatmapGrid, gridN])

  useEffect(() => {
    return () => {
      heatmapTexture?.dispose()
    }
  }, [heatmapTexture])

  useEffect(() => {
    scene?.setHeatmapTexture(showHeatmap ? heatmapTexture : null)
  }, [showHeatmap, heatmapTexture, scene])

  // Worker-based heatmap calculation
  useEffect(() => {
    if (!showHeatmap || heatmapGrid) return

    let active = true

    localSunlitGridAsync({
      heights,
      sizePx: terrain.size_px,
      spacingM: terrain.spacing_m,
      ephem: bundle.ephem,
      observerHeightM,
      startMs,
      endMs,
      gridN,
      extentM,
      rays: 360,
    })
      .then((grid) => {
        if (!active) return
        setHeatmapGrid(grid)
      })
      .catch((err) => {
        if (!active) return
        if (err?.message !== 'cancelled') {
          console.error('Failed to compute local sunlight map', err)
        }
      })

    return () => {
      active = false
      cancelLocalSunlitGrid()
    }
  }, [
    showHeatmap,
    heatmapGrid,
    heights,
    terrain.size_px,
    terrain.spacing_m,
    bundle.ephem,
    observerHeightM,
    startMs,
    endMs,
    gridN,
    extentM,
  ])

  // Held arrow keys move the lander continuously; the readout and the horizon follow while it moves.
  const lastSyncRef = useRef(0)
  const keyMotionRef = useRef<KeyMotion | null>(null)
  useEffect(() => {
    if (!scene) return
    let pos: OffsetM = { eastM: 0, northM: 0 }
    const motion = createKeyMotion({
      speed: LANDER_M_PER_S,
      reducedMotion: () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches),
      onStart: () => {
        // A held key takes over from a running animated move without a jump.
        scene.cancelLanderAnimation()
        moveSeqRef.current++
        pos = scene.currentLanderOffset()
        targetOffsetRef.current = pos
        setBestSpotResult(null)
      },
      onMove: (dx, dy) => {
        const c = clampLanderOffset(
          { eastM: pos.eastM + dx, northM: pos.northM + dy },
          terrain.size_px,
          terrain.spacing_m,
        )
        pos = c.offset
        targetOffsetRef.current = pos
        scene.setLanderOffset(pos.eastM, pos.northM)
        setIsClamped(c.clamped)
        const t = performance.now()
        if (t - lastSyncRef.current > READOUT_MS) {
          lastSyncRef.current = t
          setLanderOffset(pos)
        }
      },
      onStop: () => setLanderOffset(pos),
    })
    keyMotionRef.current = motion
    return () => {
      motion.dispose()
      keyMotionRef.current = null
    }
  }, [scene, terrain.size_px, terrain.spacing_m])

  const handleLanderKeyDown = (e: React.KeyboardEvent) => {
    if (keyMotionRef.current?.handleKey(e, true)) e.preventDefault()
  }
  const handleLanderKeyUp = (e: React.KeyboardEvent) => {
    keyMotionRef.current?.handleKey(e, false)
  }

  const handleResetPosition = () => {
    void moveLanderTo({ eastM: 0, northM: 0 }, MOVE_MS)
    setIsClamped(false)
    setBestSpotResult(null)
    setShowComparison(false)
    setSearchMessage(null)
  }

  useEffect(() => {
    return () => {
      cancelBestSpotSearch()
    }
  }, [])

  const handleFindBestSpot = async () => {
    if (isSearching) return
    setIsSearching(true)
    setSearchProgress(0)
    setSearchMessage(null)

    const clampedRadius = clampSearchRadius(
      searchRadiusM,
      terrain.size_px,
      terrain.spacing_m,
    )

    try {
      const { result, sunlitGrid } = await findBestSpotAsync(
        {
          heights,
          sizePx: terrain.size_px,
          spacingM: terrain.spacing_m,
          ephem: bundle.ephem,
          observerHeightM,
          startMs,
          endMs,
          gridN,
          extentM,
          radiusM: clampedRadius,
          cachedSunlitGrid: heatmapGrid,
          rays: 360,
        },
        (progress) => {
          setSearchProgress(progress)
        },
      )

      if (sunlitGrid && !heatmapGrid) {
        setHeatmapGrid(sunlitGrid)
      }

      if (!result) {
        const isOutOfRange =
          origSunHours === null || bundle.ephem.count === 0 || startMs >= endMs
        setSearchMessage(
          isOutOfRange
            ? 'Outside ephemeris coverage'
            : 'No flat spot found in this radius',
        )
        setBestSpotResult(null)
      } else {
        setSearchMessage(null)
        if (await moveLanderTo(result.offset, MOVE_MS)) {
          setIsClamped(false)
          setBestSpotResult(result)
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'cancelled') {
        return
      }
      console.error('Failed to find sunniest spot', err)
      setSearchMessage('Failed to find sunniest spot')
    } finally {
      setIsSearching(false)
    }
  }

  const handleCancelSearch = () => {
    cancelBestSpotSearch()
    setIsSearching(false)
    setSearchProgress(0)
  }

  const isAtOrigin = landerOffset.eastM === 0 && landerOffset.northM === 0

  const activeMask: readonly number[] = useMemo(() => {
    if (isAtOrigin) return pickMask(bundle, observerHeightM)
    return Array.from(movedMask)
  }, [isAtOrigin, bundle, observerHeightM, movedMask])

  // A moved lander uses a local mask with its own ray count, so its step differs from the site mask.
  const activeStepDeg = isAtOrigin ? bundle.horizon.az_step_deg : 360 / activeMask.length
  const sunRead = sample
    ? describeBody(
        sample.sun,
        activeMask,
        activeStepDeg,
        bundle.ephem.sun_ang_radius_deg,
      )
    : null
  const product = terrain.dem?.product
  const legend = bundle.synthetic || !product ? 'Terrain: synthetic' : `Terrain: ${product}`

  return (
    <>
      <div
        className="surface__frame"
        {...(simple
          ? {
              tabIndex: 0,
              'aria-label': '3D view. Arrow keys move the lander.',
              onKeyDown: handleLanderKeyDown,
              onKeyUp: handleLanderKeyUp,
              onBlur: () => keyMotionRef.current?.release(),
            }
          : {})}
      >
        <div
          ref={holderRef}
          className="surface__canvas"
          role="img"
          aria-label={`3D view of ${bundle.site.name}, ${fmtUtc(cursorMs)}`}
        />
        {simple && chipPresence.mounted && chipResult && (
          <div
            className="surface__result-card surface__result-chip presence-rise"
            data-state={chipPresence.state}
            role="status"
            aria-live="polite"
            aria-label="Sunniest spot result"
          >
            <div className="surface__result-sentence">
              {formatSimpleResultSentence(landerOffset, deltaHours)}
            </div>
            {!isAtOrigin && (
              <button type="button" onClick={handleResetPosition}>
                Move back
              </button>
            )}
            <button type="button" className="surface__chip-close" aria-label="Dismiss result" onClick={() => setDismissedResult(bestSpotResult)}>
              ×
            </button>
          </div>
        )}
        {!simple && <Badges bundle={bundle} edgeWarning={isClamped} moved={!isAtOrigin} />}
        <div className="surface__overlay surface__overlay--tl">
          <div className="surface__time">{fmtUtc(cursorMs)}</div>
          {simple ? (
            <div className={sunRead?.visible ? 'surface__state surface__state--on' : 'surface__state'}>
              {sample && sunRead ? simpleSunText(sunRead.visible, sample.sun.el) : 'Outside data range'}
            </div>
          ) : sample && sunRead ? (
            <>
              <div className={sunRead.visible ? 'surface__state surface__state--on' : 'surface__state'}>
                {sunStateText(sunRead.visible)}
              </div>
              <div>
                Sun el <b>{fmtNum(sample.sun.el, 2, true)} deg</b>, az <b>{fmtNum(sample.sun.az, 1)} deg</b>
              </div>
              <div>
                Earth lit <b>{fmtNum(earthIlluminatedFraction(sample.sun, sample.earth) * 100, 0)} %</b>
              </div>
            </>
          ) : (
            <div className="surface__state">Outside data range</div>
          )}
        </div>
        {facingNote && (
          <div className="surface__overlay surface__overlay--note" role="status">
            {facingNote}
          </div>
        )}
        {!simple && (
          <>
        <div className="surface__overlay surface__overlay--bl">
          <div>{legend}</div>
          <div>{earthOrientation ? 'Earth imagery: NASA Blue Marble' : 'Earth imagery: NASA Blue Marble (orientation illustrative)'}</div>
        </div>
        <div className="surface__overlay surface__overlay--br">
          {mode === 'surface'
            ? 'Drag or arrow keys to look around; click terrain to move lander'
            : 'Drag to orbit, scroll to zoom; click terrain to move lander'}
        </div>
          </>
        )}
        {simple && <LookHint />}
      </div>

      <div className="surface__controls">
        <div className="group" role="group" aria-label="Camera">
          <button
            type="button"
            aria-pressed={mode === 'surface'}
            onClick={() => switchMode('surface')}
          >
            On the surface
          </button>
          <button
            type="button"
            aria-pressed={mode === 'overview'}
            onClick={() => {
              switchMode('overview')
              setFacing(null)
            }}
          >
            Overview
          </button>
        </div>
        <LockButton
          body="sun"
          disabled={!sample}
          title={faceTitle('Sun', mode, Boolean(sample))}
          locked={locked === 'sun'}
          onClick={() => {
            setLocked(null)
            faceBody('sun')
          }}
          onLock={() => lockBody('sun')}
          onUnlock={unlock}
        >
          Face the Sun
        </LockButton>
        <LockButton
          body="earth"
          disabled={!sample}
          title={faceTitle('Earth', mode, Boolean(sample))}
          locked={locked === 'earth'}
          onClick={() => {
            setLocked(null)
            faceBody('earth')
          }}
          onLock={() => lockBody('earth')}
          onUnlock={unlock}
        >
          Face the Earth
        </LockButton>
        <LockButton
          body="lander"
          disabled={mode !== 'overview'}
          title={faceTitle('lander', mode, true)}
          locked={locked === 'lander'}
          onClick={faceLander}
          onLock={() => lockBody('lander')}
          onUnlock={unlock}
        >
          Face the lander
        </LockButton>
        {!simple && (
          <>
        <label className="group">
          <span className="group__label">Vertical exaggeration</span>
          <input
            type="range"
            aria-label="Vertical exaggeration"
            min={1}
            max={MAX_EXAGGERATION}
            step={0.5}
            value={exaggeration}
            onChange={(e) => setExaggeration(Number(e.target.value))}
          />
          <b className="surface__value">{exaggeration}x</b>
        </label>
        <label className="group">
          <span className="group__label">Sun and Earth size</span>
          <input
            type="range"
            aria-label="Sun and Earth size"
            min={SIZE_MIN}
            max={SIZE_MAX}
            step={SIZE_STEP}
            value={sizeScale}
            aria-valuetext={sizeValueText(sizeScale)}
            onChange={(e) => setSizeScale(Number(e.target.value))}
          />
          <b className="surface__value surface__value--wide">{sizeLabel(sizeScale)}</b>
        </label>

        <button
          type="button"
          aria-pressed={showHeatmap}
          onClick={() => setShowHeatmap((prev) => !prev)}
        >
          Sunlight map
        </button>

          </>
        )}
        {simple && (
          <button
            type="button"
            aria-label="Terrain and image credits"
            aria-expanded={showCredits}
            onClick={() => setShowCredits((v) => !v)}
          >
            i
          </button>
        )}
        <div className="group" role="group" aria-label="Sunniest spot search">
          {!simple && (
          <label className="group">
            <span className="group__label">Radius</span>
            <select
              value={searchRadiusM}
              onChange={(e) => {
                setSearchRadiusM(Number(e.target.value))
                setSearchMessage(null)
              }}
              disabled={isSearching}
              aria-label="Search radius"
            >
              <option value={500}>500 m</option>
              <option value={1000}>1 km</option>
              <option value={2000}>2 km</option>
            </select>
          </label>
          )}
          <button
            type="button"
            disabled={isSearching}
            onClick={handleFindBestSpot}
          >
            {simple ? 'Find the sunniest spot nearby' : 'Find sunniest spot'}
          </button>
          {isSearching && (
            <button
              type="button"
              onClick={handleCancelSearch}
              aria-label="Cancel sunniest spot search"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {simple && showCredits && (
        <div className="surface__credits">
          {legend}. {earthOrientation ? 'Earth imagery: NASA Blue Marble' : 'Earth imagery: NASA Blue Marble (orientation illustrative)'}.
        </div>
      )}

      {isSearching && (
        <div className="surface__search-progress" role="status" aria-live="polite">
          Searching for sunniest spot: {Math.round(searchProgress * 100)}%
        </div>
      )}

      {searchMessage && (
        <div className="surface__best-spot-alert" role="status">
          {searchMessage}
        </div>
      )}

      {/* Best Spot Result Card */}
      {!simple && bestSpotResult && (
        <div className="surface__result-card" role="status" aria-live="polite" aria-label="Sunniest spot result">
          <div className="surface__result-badges">
            {bundle.synthetic && <span className="badge badge--synthetic">Synthetic data</span>}
            <span className="badge badge--approximate">Approximate (local terrain patch horizon)</span>
          </div>
          <div className="surface__result-sentence">
            {formatResultSentence(
              landerOffset,
              movedSunHours ?? 0,
              origSunHours ?? 0,
            )}
          </div>
          {showComparison && (
            <div className="surface__result-compare" aria-label="Points comparison">
              <div className="surface__compare-col">
                <span className="surface__compare-label">Original site:</span>
                <b>{origSunHours !== null ? `${Math.round(origSunHours)} h` : '—'}</b>
              </div>
              <div className="surface__compare-col">
                <span className="surface__compare-label">Chosen spot:</span>
                <b>{movedSunHours !== null ? `${Math.round(movedSunHours)} h` : '—'}</b>
              </div>
              <div className="surface__compare-col">
                <span className="surface__compare-label">Gain:</span>
                <b className="surface__hours-delta">{formatDeltaHours(deltaHours)}</b>
              </div>
            </div>
          )}
          <div className="surface__result-actions">
            <button
              type="button"
              onClick={handleResetPosition}
            >
              Reset position
            </button>
            <button
              type="button"
              aria-pressed={showComparison}
              onClick={() => setShowComparison((prev) => !prev)}
            >
              Compare both points
            </button>
          </div>
        </div>
      )}

      {/* Lander Position and What-If Horizon Recompute */}
      {!simple && (
      <div className="surface__lander-box">
        <div className="surface__lander-header">
          <div
            className="surface__nudge-control"
            tabIndex={0}
            role="group"
            aria-roledescription="position control"
            aria-label={`Lander position: ${formatOffset(landerOffset)}, height ${fmtNum(landerHeight, 1, true)} m. Arrow keys nudge.`}
            onKeyDown={handleLanderKeyDown}
            onKeyUp={handleLanderKeyUp}
            onBlur={() => keyMotionRef.current?.release()}
          >
            <div className="surface__control-label">Lander position (arrow keys, Shift faster, Alt finer)</div>
            <div className="surface__readouts">
              <span>Offset: <b>{formatOffset(landerOffset)}</b></span>
              <span>Terrain height: <b>{fmtNum(landerHeight, 1, true)} m</b></span>
            </div>
          </div>
          <button
            type="button"
            disabled={isAtOrigin}
            onClick={handleResetPosition}
          >
            Reset position
          </button>
        </div>

        <div className="surface__hours-row" title="Sun visible hours for the scenario window evaluated on this terrain patch">
          <span className="surface__hours-title">Sun visible hours:</span>
          <span className="badge badge--approximate">Approximate</span>
          {bundle.synthetic && <span className="badge badge--synthetic">Synthetic data</span>}
          <span className="surface__hours-stat">
            <b>{movedSunHours !== null ? `${movedSunHours.toFixed(1)} h` : '—'}</b>
            <span
              className="surface__hours-site"
              title="The patch-only horizon covers the terrain patch around the site. The card metrics use the full LOLA horizon mask, so the two totals differ."
            >
              {' '}
              (patch-only site estimate: {origSunHours !== null ? `${origSunHours.toFixed(1)} h` : '—'}
              {cardSunHours !== null ? `; card, full horizon: ${cardSunHours.toFixed(1)} h` : ''})
            </span>
            <b className="surface__hours-delta"> {formatDeltaHours(deltaHours)}</b>
          </span>
        </div>
      </div>

      )}

      {/* Sunlight Heatmap Legend & Cell Inspector */}
      {!simple && showHeatmap && (
        <div className="surface__heatmap-panel" aria-label="Local sunlight map legend">
          {heatmapLoading ? (
            <div className="surface__heatmap-loading" role="status" aria-busy="true">
              Computing sunlight map...
            </div>
          ) : heatmapGrid ? (
            <>
              <div className="surface__legend-meta">
                <div className="surface__legend-title-group">
                  <span className="surface__legend-name">Sun visible map</span>
                  <span className="badge badge--approximate">Approximate</span>
                  {bundle.synthetic && <span className="badge badge--synthetic">Synthetic data</span>}
                </div>
                <span className="surface__legend-res">Resolution: ~{cellResolutionM} m</span>
              </div>
              <div className="surface__ramp-row">
                <span className="surface__ramp-num">{Math.round(heatmapRange.min)}%</span>
                <div
                  className="surface__ramp-bar"
                  role="img"
                  aria-label="Colour-blind safe Viridis sequential ramp from 0 to 100 percent"
                />
                <span className="surface__ramp-num">{Math.round(heatmapRange.max)}%</span>
              </div>
              <div className="surface__cell-inspector" aria-live={hoveredCell ? 'off' : 'polite'}>
                {hoveredCell !== null
                  ? `Hovered cell: ${hoveredCell.pct.toFixed(1)}% Sun visible (${formatOffset({ eastM: hoveredCell.eastM, northM: hoveredCell.northM })})`
                  : landerCellPct !== null && !Number.isNaN(landerCellPct)
                    ? `Lander cell: ${landerCellPct.toFixed(1)}% Sun visible (${formatOffset(landerOffset)})`
                    : 'Hover terrain or nudge lander to inspect cell values'}
              </div>
            </>
          ) : null}
        </div>
      )}
    </>
  )
}

function SurfaceViewInner({ scenario, simple }: { scenario: Scenario; simple: boolean }) {
  const { status, bundle, error } = useSiteBundle(scenario.siteId)
  const terrain = bundle?.terrain ?? null
  const heights = useTerrainHeights(terrain)

  let body
  if (status === 'error') {
    body = (
      <div className="surface__frame surface__box surface__box--error" role="alert">
        {error ?? 'Failed to load site data'}
      </div>
    )
  } else if (status === 'loading' || !bundle) {
    body = <div className="surface__frame surface__box surface__skeleton" role="status" aria-busy="true" aria-label="Loading 3D view" />
  } else if (!terrain) {
    body = (
      <>
        <div className="surface__frame surface__box">No terrain for this site</div>
        <div className="surface__controls">
          <button
            type="button"
            disabled
            title="No terrain data for this site"
            aria-label="No terrain data for this site"
          >
            Find sunniest spot
          </button>
        </div>
      </>
    )
  } else if (heights.status === 'error') {
    body = (
      <div className="surface__frame surface__box surface__box--error" role="alert">
        {heights.error ?? 'Failed to load terrain'}
      </div>
    )
  } else if (heights.status !== 'ready' || !heights.heights) {
    body = <div className="surface__frame surface__box surface__skeleton" role="status" aria-busy="true" aria-label="Loading terrain" />
  } else {
    body = (
      <SurfaceStage
        simple={simple}
        key={`${scenario.id}-${bundle.site.id}`}
        scenario={scenario}
        bundle={bundle}
        terrain={terrain}
        heights={heights.heights}
      />
    )
  }

  return <div className="surface">{body}</div>
}

export function SurfaceView({ scenarioId, variant = 'full' }: { scenarioId: string; variant?: SurfaceVariant }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <SurfaceViewInner scenario={scenario} simple={variant === 'simple'} />
}
