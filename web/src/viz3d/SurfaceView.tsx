import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { registerActiveScene } from '../components/demo/cameraControl'
import { describeBody, fmtNum, fmtUtc, pickMask, sunStateText } from '../components/sky/geometry'
import { sampleAt } from '../lib/ephem'
import { earthIlluminatedFraction } from '../lib/earthPhase'
import type { SiteBundle, TerrainFile } from '../lib/types'
import { useSiteBundle } from '../lib/useSiteBundle'
import { scenarioCursorMs, scenarioWindowMs } from '../state/selectors'
import { useAppStore } from '../state/store'
import type { Scenario } from '../state/types'
import { SurfaceScene } from './scene'
import type { SkyState, ViewMode } from './scene'
import { heightAt } from './terrain'
import { horizonFromTerrain } from './terrainHorizon'
import { cancelLocalSunlitGrid, localSunlitGridAsync } from './localIllumClient'
import { cancelBestSpotSearch, findBestSpotAsync } from './bestSpotClient'
import { clampSearchRadius, formatResultSentence } from './bestSpot'
import type { BestSpotResult } from './bestSpot'
import { createHeatmapTexture } from './heatmapTexture'
import {
  cellIndexAt,
  clampLanderOffset,
  computeSunVisibleHours,
  formatDeltaHours,
  formatOffset,
  legendRange,
  nudgeOffset,
} from './landerHelpers'
import type { OffsetM } from './landerHelpers'
import { useTerrainHeights } from './useTerrainHeights'
import './surface.css'

const MAX_EXAGGERATION = 5

function Badges({ bundle, edgeWarning }: { bundle: SiteBundle; edgeWarning?: boolean }) {
  return (
    <div className="surface__badges">
      {bundle.synthetic && <span className="badge badge--synthetic">Synthetic data</span>}
      <span className="badge badge--approximate">Approximate (terrain patch only)</span>
      {edgeWarning && <span className="badge badge--warn">Edge of the terrain data</span>}
    </div>
  )
}

interface StageProps {
  scenario: Scenario
  bundle: SiteBundle
  terrain: TerrainFile
  heights: Float32Array
}

function SurfaceStage({ scenario, bundle, terrain, heights }: StageProps) {
  const holderRef = useRef<HTMLDivElement>(null)
  const [scene, setScene] = useState<SurfaceScene | null>(null)
  const [mode, setMode] = useState<ViewMode>('surface')
  const [exaggeration, setExaggeration] = useState(1)
  const [magnify, setMagnify] = useState(false)

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
  const [showComparison, setShowComparison] = useState(false)

  const cursorH = useAppStore((s) => s.cursorH)
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
  const origMask = useMemo(
    () =>
      horizonFromTerrain(heights, terrain.size_px, terrain.spacing_m, 0, 0, observerHeightM, {
        rays: 360,
      }),
    [heights, terrain.size_px, terrain.spacing_m, observerHeightM],
  )
  const origSunHours = useMemo(
    () => computeSunVisibleHours(bundle.ephem, origMask, 1.0, startMs, endMs),
    [bundle.ephem, origMask, startMs, endMs],
  )

  const movedMask = useMemo(() => {
    if (landerOffset.eastM === 0 && landerOffset.northM === 0) return origMask
    return horizonFromTerrain(
      heights,
      terrain.size_px,
      terrain.spacing_m,
      landerOffset.eastM,
      landerOffset.northM,
      observerHeightM,
      { rays: 360 },
    )
  }, [heights, terrain.size_px, terrain.spacing_m, landerOffset, observerHeightM, origMask])

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

  const sky = useMemo<SkyState>(
    () => ({
      sun: sample?.sun ?? null,
      earth: sample?.earth ?? null,
      sunAngRadiusDeg: bundle.ephem.sun_ang_radius_deg,
      earthAngRadiusDeg: bundle.ephem.earth_ang_radius_deg,
      magnify,
    }),
    [sample, bundle.ephem, magnify],
  )

  const skyRef = useRef(sky)
  useEffect(() => {
    skyRef.current = sky
  })

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const s = new SurfaceScene(holder, {
      heights,
      sizePx: terrain.size_px,
      spacingM: terrain.spacing_m,
    })
    s.lookAtAzimuth(skyRef.current.sun?.az ?? 0)
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

  useEffect(() => scene?.setMode(mode), [scene, mode])
  useEffect(() => scene?.setExaggeration(exaggeration), [scene, exaggeration])
  useEffect(() => scene?.setEyeHeight(observerHeightM), [scene, observerHeightM])
  useEffect(() => scene?.setSky(sky), [scene, sky])

  // Sync lander position with 3D scene
  useEffect(() => {
    scene?.setLanderOffset(landerOffset.eastM, landerOffset.northM)
  }, [scene, landerOffset])

  // Raycast terrain click to move lander
  const handleTerrainClick = useCallback(
    (hit: { eastM: number; northM: number; heightM: number }) => {
      const clamped = clampLanderOffset(
        { eastM: Math.round(hit.eastM), northM: Math.round(hit.northM) },
        terrain.size_px,
        terrain.spacing_m,
      )
      setLanderOffset(clamped.offset)
      setIsClamped(clamped.clamped)
      setBestSpotResult(null)
    },
    [terrain.size_px, terrain.spacing_m],
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

  // Heatmap texture sync with 3D scene
  useEffect(() => {
    if (!showHeatmap || !heatmapGrid) {
      scene?.setHeatmapTexture(null)
      return
    }
    const { texture } = createHeatmapTexture(heatmapGrid, gridN)
    scene?.setHeatmapTexture(texture)
  }, [showHeatmap, heatmapGrid, scene, gridN])

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

  // Keyboard nudges on focused lander position control
  const handleLanderKeyDown = (e: React.KeyboardEvent) => {
    const next = nudgeOffset(landerOffset, e.key, e.shiftKey)
    if (next) {
      e.preventDefault()
      const clamped = clampLanderOffset(next, terrain.size_px, terrain.spacing_m)
      setLanderOffset(clamped.offset)
      setIsClamped(clamped.clamped)
      setBestSpotResult(null)
    }
  }

  const handleResetPosition = () => {
    setLanderOffset({ eastM: 0, northM: 0 })
    setIsClamped(false)
    setBestSpotResult(null)
    setShowComparison(false)
    setSearchMessage(null)
    scene?.setLanderOffset(0, 0)
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
        setSearchMessage('No flat spot found in this radius')
        setBestSpotResult(null)
      } else {
        setSearchMessage(null)
        if (scene) {
          await scene.animateLanderTo(result.offset, 1200)
        }
        setLanderOffset(result.offset)
        setIsClamped(false)
        setBestSpotResult(result)
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

  const sunRead = sample
    ? describeBody(
        sample.sun,
        pickMask(bundle, observerHeightM),
        bundle.horizon.az_step_deg,
        bundle.ephem.sun_ang_radius_deg,
      )
    : null
  const product = terrain.dem?.product
  const legend = bundle.synthetic || !product ? 'Terrain: synthetic' : `Terrain: ${product}`

  return (
    <>
      <div className="surface__frame">
        <div
          ref={holderRef}
          className="surface__canvas"
          role="img"
          aria-label={`3D view of ${bundle.site.name}, ${fmtUtc(cursorMs)}`}
        />
        <Badges bundle={bundle} edgeWarning={isClamped} />
        <div className="surface__overlay surface__overlay--tl">
          <div className="surface__time">{fmtUtc(cursorMs)}</div>
          {sample && sunRead ? (
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
        <div className="surface__overlay surface__overlay--bl">{legend}</div>
        <div className="surface__overlay surface__overlay--br">
          {mode === 'surface'
            ? 'Drag or arrow keys to look around; click terrain to move lander'
            : 'Drag to orbit, scroll to zoom; click terrain to move lander'}
        </div>
      </div>

      <div className="surface__controls">
        <div className="group" role="group" aria-label="Camera">
          <button
            type="button"
            aria-pressed={mode === 'surface'}
            onClick={() => setMode('surface')}
          >
            On the surface
          </button>
          <button
            type="button"
            aria-pressed={mode === 'overview'}
            onClick={() => setMode('overview')}
          >
            Overview
          </button>
        </div>
        <button
          type="button"
          disabled={mode !== 'surface' || !sample}
          onClick={() => sample && scene?.faceDirection(sample.sun.az, sample.sun.el)}
        >
          Face the Sun
        </button>
        <label className="group">
          <span className="group__label">Vertical exaggeration</span>
          <input
            type="range"
            min={1}
            max={MAX_EXAGGERATION}
            step={0.5}
            value={exaggeration}
            onChange={(e) => setExaggeration(Number(e.target.value))}
          />
          <b className="surface__value">{exaggeration}x</b>
        </label>
        <label className="group">
          <input type="checkbox" checked={magnify} onChange={(e) => setMagnify(e.target.checked)} />
          <span className="group__label">Magnify Sun and Earth x4</span>
        </label>

        <button
          type="button"
          aria-pressed={showHeatmap}
          onClick={() => setShowHeatmap((prev) => !prev)}
        >
          Sunlight map
        </button>

        <div className="group" role="group" aria-label="Sunniest spot search">
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
          <button
            type="button"
            disabled={isSearching}
            onClick={handleFindBestSpot}
          >
            Find sunniest spot
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

      {isSearching && (
        <div className="surface__search-progress" aria-live="polite">
          Searching for sunniest spot: {Math.round(searchProgress * 100)}%
        </div>
      )}

      {searchMessage && (
        <div className="surface__best-spot-alert" role="status">
          {searchMessage}
        </div>
      )}

      {/* Best Spot Result Card */}
      {bestSpotResult && (
        <div className="surface__result-card" role="region" aria-label="Sunniest spot result">
          <div className="surface__result-badges">
            {bundle.synthetic && <span className="badge badge--synthetic">Synthetic data</span>}
            <span className="badge badge--approximate">Approximate (terrain patch only)</span>
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
      <div className="surface__lander-box">
        <div className="surface__lander-header">
          <div
            className="surface__nudge-control"
            tabIndex={0}
            role="region"
            aria-label="Lander position. Use arrow keys to nudge 100 m, Shift with arrow keys to nudge 500 m. Or click on the terrain."
            onKeyDown={handleLanderKeyDown}
          >
            <div className="surface__control-label">Lander position (arrow keys ±100 m, Shift ±500 m)</div>
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
          <span className="surface__hours-stat">
            <b>{movedSunHours !== null ? `${movedSunHours.toFixed(1)} h` : '—'}</b>
            <span className="surface__hours-site"> (site: {origSunHours !== null ? `${origSunHours.toFixed(1)} h` : '—'})</span>
            <b className="surface__hours-delta"> {formatDeltaHours(deltaHours)}</b>
          </span>
        </div>
      </div>

      {/* Sunlight Heatmap Legend & Cell Inspector */}
      {showHeatmap && (
        <div className="surface__heatmap-panel" aria-label="Local sunlight map legend">
          {heatmapLoading ? (
            <div className="surface__heatmap-loading" aria-busy="true">
              Computing sunlight map...
            </div>
          ) : heatmapGrid ? (
            <>
              <div className="surface__legend-meta">
                <span className="surface__legend-name">Sun visible map</span>
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
              <div className="surface__cell-inspector" tabIndex={0} aria-live="polite">
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

function SurfaceViewInner({ scenario }: { scenario: Scenario }) {
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
    body = <div className="surface__frame surface__box surface__skeleton" aria-busy="true" aria-label="Loading 3D view" />
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
    body = <div className="surface__frame surface__box surface__skeleton" aria-busy="true" aria-label="Loading terrain" />
  } else {
    body = (
      <SurfaceStage
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

export function SurfaceView({ scenarioId }: { scenarioId: string }) {
  const scenario = useAppStore((s) => s.scenarios.find((x) => x.id === scenarioId))
  if (!scenario) return null
  return <SurfaceViewInner scenario={scenario} />
}
