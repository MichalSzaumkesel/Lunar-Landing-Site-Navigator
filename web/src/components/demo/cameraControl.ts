import type { SurfaceScene } from '../../viz3d/scene'
import { cameraEase } from '../../viz3d/scene'
import { sampleAt } from '../../lib/ephem'
import { scenarioCursorMs } from '../../state/selectors'
import { useAppStore } from '../../state/store'
import type { DemoStepContext } from './demoSteps'

export { cameraEase }

let activeScene: SurfaceScene | null = null
const readyListeners = new Set<(scene: SurfaceScene) => void>()

/** Registers the currently mounted 3D scene instance for imperative camera control. */
export function registerActiveScene(scene: SurfaceScene): () => void {
  activeScene = scene
  for (const cb of readyListeners) {
    cb(scene)
  }
  return () => {
    if (activeScene === scene) {
      activeScene = null
    }
  }
}

/** Retrieves the currently registered 3D scene, or null if unmounted. */
export function getActiveScene(): SurfaceScene | null {
  return activeScene
}

/** Notifies callback when a 3D scene instance is mounted and ready. */
export function onSceneReady(cb: (scene: SurfaceScene) => void): () => void {
  if (activeScene) {
    cb(activeScene)
  }
  readyListeners.add(cb)
  return () => {
    readyListeners.delete(cb)
  }
}

/**
 * Triggers the cinematic camera pan for demo / video script step 2:
 * First looks towards Sun's azimuth at the cursor, then smoothly pans
 * to Earth's azimuth over durationMs while Play advances time.
 */
export function triggerDemoCameraPan(
  ctx?: DemoStepContext,
  durationMs: number = 7000,
): void {
  // If 3D tab is available in DOM but not selected, select it
  if (typeof document !== 'undefined') {
    const tab3d = document.querySelector<HTMLButtonElement>('[role="tab"][id$="-tab-3d"]')
    if (tab3d && tab3d.getAttribute('aria-selected') !== 'true') {
      tab3d.click()
    }
  }

  const store = useAppStore.getState()
  const scenario =
    store.scenarios.find((s) => s.id === store.activeScenarioId) ??
    store.scenarios[1] ??
    store.scenarios[0]
  const bundle =
    ctx?.bundles.find((b) => b?.site.id === scenario?.siteId) ??
    ctx?.bundles[1] ??
    ctx?.bundles[0]

  if (!scenario || !bundle?.ephem) return

  const cursorMs = scenarioCursorMs(scenario, store.cursorH)
  const sample = sampleAt(bundle.ephem, cursorMs)
  if (!sample?.sun || !sample?.earth) return

  const sunAz = sample.sun.az
  const sunEl = sample.sun.el
  const earthAz = sample.earth.az
  const earthEl = sample.earth.el

  const executePan = (scene: SurfaceScene) => {
    // First look toward Sun's current azimuth
    scene.faceDirection(sunAz, sunEl)
    // Then slowly pan to Earth's azimuth while Play advances time
    scene.cameraTo({
      azimuthDeg: earthAz,
      elevationDeg: earthEl,
      durationMs,
    })
  }

  const current = getActiveScene()
  if (current) {
    executePan(current)
  } else {
    // If scene is currently mounting, hook into onSceneReady once
    const cleanup = onSceneReady((scene) => {
      cleanup()
      executePan(scene)
    })
  }
}
