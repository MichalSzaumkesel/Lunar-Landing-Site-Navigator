// Pure helpers for the "About the data" panel: reads validation.json into grouped checks.

export interface ValidationCheck {
  id: string
  kind: string
  pass: boolean
  siteId: string | null
  notes: string
}

export interface ValidationGroup {
  kind: string
  title: string
  checks: ValidationCheck[]
  passed: number
}

export interface ValidationSummary {
  passed: number
  total: number
  groups: ValidationGroup[]
}

const TITLES: Record<string, string> = {
  ephemeris: 'Sun and Earth positions vs JPL Horizons',
  horizon_sensitivity: 'Horizon sensitivity to DEM resolution and site position',
  illumination_reference: 'Sun visible and Earth in view vs NASA LOLA maps',
  illumination_heatmap_reference: 'Local illumination heatmap vs NASA LOLA maps',
  metrics_crosscheck: 'Metrics cross-check',
  orientation: 'Polar orientation vs the IAU gazetteer',
}

function titleOf(kind: string): string {
  return TITLES[kind] ?? kind.replace(/_/g, ' ')
}

/** Returns null when the value is not a validation file with at least one check. */
export function summariseValidation(json: unknown): ValidationSummary | null {
  const checks = (json as { checks?: unknown } | null)?.checks
  if (!Array.isArray(checks)) return null
  const byKind = new Map<string, ValidationCheck[]>()
  for (const raw of checks) {
    const c = raw as Record<string, unknown> | null
    if (!c || typeof c.id !== 'string' || typeof c.pass !== 'boolean') continue
    const kind = typeof c.kind === 'string' ? c.kind : 'other'
    const list = byKind.get(kind) ?? []
    list.push({
      id: c.id,
      kind,
      pass: c.pass,
      siteId: typeof c.site_id === 'string' ? c.site_id : null,
      notes: typeof c.notes === 'string' ? c.notes : '',
    })
    byKind.set(kind, list)
  }
  const groups: ValidationGroup[] = [...byKind].map(([kind, list]) => ({
    kind,
    title: titleOf(kind),
    checks: list,
    passed: list.filter((c) => c.pass).length,
  }))
  const total = groups.reduce((n, g) => n + g.checks.length, 0)
  if (total === 0) return null
  return { passed: groups.reduce((n, g) => n + g.passed, 0), total, groups }
}

export const REPO_DOCS_URL = 'https://github.com/MichalSzaumkesel/Lunar-Landing-Site-Navigator/blob/main/docs'
