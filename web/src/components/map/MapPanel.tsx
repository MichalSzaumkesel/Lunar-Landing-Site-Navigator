import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type FormEvent,
} from 'react'
import { MAX_SCENARIOS } from '../../config/dataRange'
import { customSiteId } from '../../lib/customSite'
import { dataSource } from '../../lib/loader'
import { bodyPositionKm, elevationGrid, terminatorLine } from '../../lib/moonFrame'
import type { Site } from '../../lib/types'
import { useSiteBundle } from '../../lib/useSiteBundle'
import { scenarioCursorMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import { formatCoordDisplay, validateCoordInputs } from './coords'
import './map.css'
import { shouldRecomputeShading } from './mapThrottling'
import { MoonMap, type MoonMapShading } from './MoonMap'
import { LegendShape } from './SiteMarkerShape'

export interface MapPanelProps {
  className?: string
}

function splitTerminator(
  pts: Array<{ lat_deg: number; lon_deg: number }>,
): Array<{ lat_deg: number; lon_deg: number }[]> {
  if (pts.length === 0) return []
  const pieces: Array<{ lat_deg: number; lon_deg: number }[]> = []
  let currentPiece: Array<{ lat_deg: number; lon_deg: number }> = [pts[0]]

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    if (Math.abs(curr.lon_deg - prev.lon_deg) > 180) {
      pieces.push(currentPiece)
      currentPiece = [curr]
    } else {
      currentPiece.push(curr)
    }
  }
  if (currentPiece.length > 0) {
    pieces.push(currentPiece)
  }
  return pieces
}

export const MapPanel: FC<MapPanelProps> = ({ className }) => {
  // Store state and actions
  const scenarios = useAppStore((s) => s.scenarios)
  const activeScenarioId = useAppStore((s) => s.activeScenarioId)
  const cursorH = useAppStore((s) => s.cursorH)
  const updateScenario = useAppStore((s) => s.updateScenario)
  const addScenario = useAppStore((s) => s.addScenario)

  // Sites loading state
  const [sites, setSites] = useState<Site[]>([])
  const [loadingSites, setLoadingSites] = useState(true)
  const [sitesError, setSitesError] = useState<string | null>(null)

  // Interactive controls
  const [pickMode, setPickMode] = useState(false)
  const [latInput, setLatInput] = useState('')
  const [lonInput, setLonInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Load curated and mock sites once on mount
  useEffect(() => {
    let cancelled = false

    dataSource.loadSites().then(
      (file) => {
        if (cancelled) return
        setSites(file.sites)
        setLoadingSites(false)
      },
      (err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setSitesError(msg)
        setLoadingSites(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [])

  // Find the active scenario
  const activeScenario =
    scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0]
  const activeSiteId = activeScenario?.siteId ?? null
  const selectedSiteIds = useMemo(
    () => scenarios.map((s) => s.siteId),
    [scenarios],
  )

  // Load active scenario bundle for ephemeris computation
  const { bundle } = useSiteBundle(activeSiteId ?? '')

  // Cursor epoch ms for the active scenario
  const cursorMs = useMemo(() => {
    if (!activeScenario) return null
    return scenarioCursorMs(activeScenario, cursorH)
  }, [activeScenario, cursorH])

  const [layers, setLayers] = useState<{
    shading: MoonMapShading | null
    terminator: Array<{ lat_deg: number; lon_deg: number }[]> | null
  }>({ shading: null, terminator: null })

  const lastLayersRef = useRef<{
    simMs: number | null
    realMs: number | null
    bundle: typeof bundle
  }>({
    simMs: null,
    realMs: null,
    bundle: null,
  })

  // Recompute shading grid and terminator only when throttled decision triggers
  useEffect(() => {
    if (!bundle || cursorMs == null) {
      lastLayersRef.current = { simMs: null, realMs: null, bundle: null }
      queueMicrotask(() => {
        setLayers((prev) =>
          prev.shading !== null || prev.terminator !== null
            ? { shading: null, terminator: null }
            : prev,
        )
      })
      return
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const last = lastLayersRef.current
    const isNewBundle = bundle !== last.bundle

    if (
      !isNewBundle &&
      !shouldRecomputeShading(cursorMs, now, last.simMs, last.realMs)
    ) {
      return
    }

    const sunKm = bodyPositionKm(bundle, 'sun', cursorMs)
    const earthKm = bodyPositionKm(bundle, 'earth', cursorMs)
    if (!sunKm || !earthKm) {
      lastLayersRef.current = { simMs: cursorMs, realMs: now, bundle }
      queueMicrotask(() => {
        setLayers((prev) =>
          prev.shading !== null || prev.terminator !== null
            ? { shading: null, terminator: null }
            : prev,
        )
      })
      return
    }

    const nLat = 45
    const nLon = 90
    const sunElevation = elevationGrid(sunKm, nLat, nLon)
    const earthElevation = elevationGrid(earthKm, nLat, nLon)
    const rawTerminator = terminatorLine(sunKm)
    const pieces = splitTerminator(rawTerminator)

    lastLayersRef.current = { simMs: cursorMs, realMs: now, bundle }
    queueMicrotask(() => {
      setLayers({
        shading: { sunElevation, earthElevation, nLat, nLon },
        terminator: pieces,
      })
    })
  }, [bundle, cursorMs])

  const { shading, terminator } = layers

  // Active site object
  const activeSite = useMemo(
    () => sites.find((s) => s.id === activeSiteId) ?? bundle?.site ?? null,
    [sites, activeSiteId, bundle],
  )

  // Site selection: clicking a marker sets active scenario site; shift-click adds scenario
  const handleSelectSite = (siteId: string, shiftKey?: boolean) => {
    if (shiftKey) {
      if (scenarios.length < MAX_SCENARIOS) {
        addScenario({ siteId })
      }
    } else if (activeScenario) {
      updateScenario(activeScenario.id, { siteId })
    }
  }

  // At the scenario limit a custom point replaces the active scenario's site instead of failing.
  const addCustomScenario = (siteId: string) => {
    if (scenarios.length >= MAX_SCENARIOS && activeScenario) updateScenario(activeScenario.id, { siteId })
    else addScenario({ siteId })
  }

  // Pick point: click on map in pickMode adds a custom site scenario
  const handlePickPoint = (lat: number, lon: number) => {
    const id = customSiteId(lat, lon)
    addCustomScenario(id)
    setPickMode(false)
  }

  // Custom coordinate form submission
  const handleCustomFormSubmit = (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const result = validateCoordInputs(latInput, lonInput)
    if (!result.valid) {
      setFormError(result.error ?? 'Invalid coordinates.')
      return
    }

    addCustomScenario(customSiteId(result.lat!, result.lon!))
    setLatInput('')
    setLonInput('')
  }

  const handleCompareActive = () => {
    if (activeSiteId && scenarios.length < MAX_SCENARIOS) {
      addScenario({ siteId: activeSiteId })
    }
  }

  return (
    <div className={`map-panel ${className ?? ''}`.trim()}>
      <div className="map-panel__layout">
      <div className="map-panel__header">
        <h2 className="map-panel__title">Moon Map</h2>
        <div className="map-panel__controls">
          <button
            type="button"
            aria-pressed={pickMode}
            onClick={() => setPickMode(!pickMode)}
            title="Click on the map or polar view to place a custom landing point"
          >
            {pickMode ? 'Cancel picking' : 'Pick a point'}
          </button>
        </div>
      </div>

      <div className="map-panel__map">
      {loadingSites && sites.length === 0 && (
        <div className="moon-map-skeleton" aria-busy="true">
          Loading Moon map sites…
        </div>
      )}

      {sitesError && (
        <div className="placeholder" role="alert">
          <p>Could not load sites data: {sitesError}</p>
        </div>
      )}

      {!loadingSites && !sitesError && (
        <MoonMap
          sites={sites}
          selectedSiteIds={selectedSiteIds}
          activeSiteId={activeSiteId}
          shading={shading}
          terminator={terminator}
          onSelectSite={handleSelectSite}
          onPickPoint={handlePickPoint}
          pickMode={pickMode}
        />
      )}
      </div>

      <div className="map-panel__side">
      {/* Selected active site banner with Compare button */}
      {activeSite && (
        <div className="map-active-bar">
          <div className="map-active-bar__info">
            <strong>Active site:</strong> {activeSite.name} (
            {formatCoordDisplay(activeSite.lat_deg, activeSite.lon_deg)})
          </div>
          <button
            type="button"
            onClick={handleCompareActive}
            disabled={scenarios.length >= MAX_SCENARIOS}
            title={
              scenarios.length >= MAX_SCENARIOS
                ? `Maximum of ${MAX_SCENARIOS} scenarios reached`
                : 'Add another scenario to compare this site'
            }
          >
            Compare
          </button>
        </div>
      )}

      {/* Custom point coordinate input form */}
      <form className="map-custom-form" onSubmit={handleCustomFormSubmit}>
        <div className="map-custom-form__row">
          <label className="map-custom-form__field">
            Lat (°):
            <input
              type="text"
              className="map-custom-form__input"
              value={latInput}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'map-coord-error' : undefined}
              onChange={(e) => {
                setLatInput(e.target.value)
                setFormError(null)
              }}
              placeholder="-89.5"
            />
          </label>
          <label className="map-custom-form__field">
            Lon (°):
            <input
              type="text"
              className="map-custom-form__input"
              value={lonInput}
              aria-invalid={Boolean(formError)}
              aria-describedby={formError ? 'map-coord-error' : undefined}
              onChange={(e) => {
                setLonInput(e.target.value)
                setFormError(null)
              }}
              placeholder="45.0"
            />
          </label>
          <button
            type="submit"
            disabled={scenarios.length >= MAX_SCENARIOS}
            title={
              scenarios.length >= MAX_SCENARIOS
                ? `Maximum of ${MAX_SCENARIOS} scenarios reached`
                : 'Add scenario at entered coordinates'
            }
          >
            Add custom point
          </button>
        </div>
        {formError && (
          <div id="map-coord-error" className="map-custom-form__error" role="alert">
            {formError}
          </div>
        )}
        <p className="map-custom-form__note">
          Custom points use a smooth horizon and the ephemeris of the nearest
          site (approximate).
        </p>
      </form>

      {/* Map Legend */}
      <div className="map-legend" aria-label="Map legend">
        <span className="map-legend__item">
          <LegendShape category="apollo" />
          Apollo
        </span>
        <span className="map-legend__item">
          <LegendShape category="clps" />
          CLPS
        </span>
        <span className="map-legend__item">
          <LegendShape category="commercial" />
          Commercial
        </span>
        <span className="map-legend__item">
          <LegendShape category="international" />
          International
        </span>
        <span className="map-legend__item">
          <LegendShape category="artemis_region" />
          Artemis
        </span>
        <span className="map-legend__item">
          <LegendShape category="custom" />
          Custom
        </span>
        <span className="map-legend__item">
          <span
            className="map-legend__swatch map-legend__swatch--rect"
            style={{ background: 'rgba(5, 8, 16, 0.8)' }}
          />
          Night shading
        </span>
        <span className="map-legend__item">
          <span className="map-legend__swatch map-legend__swatch--rect map-legend__swatch--hatch" />
          Earth not in view
        </span>
        <span className="map-legend__item">
          <span className="map-legend__swatch--terminator" />
          Terminator
        </span>
      </div>
      </div>
      </div>
    </div>
  )
}

export default MapPanel
