import type { ScenarioMetrics } from './types'

export const EXPORT_PNG_FOOTER =
  'Lunar Landing Site Navigator, Sun visible and Earth in view only, not a power or link guarantee'

export function getFooterText(): string {
  return EXPORT_PNG_FOOTER
}

/**
 * Builds the download filename for a scenario card PNG export.
 * Follows the pattern: <siteId>_<startDate>.png
 */
export function buildPngFilename(siteId: string, startDate: string | number): string {
  const cleanSiteId = siteId.trim().replace(/[^a-zA-Z0-9_-]/g, '_')
  let dateStr = ''
  if (typeof startDate === 'number') {
    dateStr = new Date(startDate).toISOString().slice(0, 10)
  } else {
    // String might be ISO UTC like '2026-12-01T00:00:00Z' or date '2026-12-01'
    const match = startDate.match(/\d{4}-\d{2}-\d{2}/)
    dateStr = match ? match[0] : startDate.slice(0, 10)
  }
  return `${cleanSiteId}_${dateStr}.png`
}

export interface CardExportData {
  siteName: string
  siteId: string
  startUtc: string
  endUtc: string
  synthetic?: boolean
  approximate?: boolean
  metrics: ScenarioMetrics | null
  svgElement: SVGSVGElement | null
}

export interface MetricTableRow {
  label: string
  value: string
}

function fmtNum(v: number, digits: number): string {
  return v.toFixed(digits)
}

/**
 * Formats key metrics from the scenario metrics object.
 * Reads directly from the metrics object without recomputing.
 */
export function extractKeyMetricRows(metrics: ScenarioMetrics | null): MetricTableRow[] {
  if (!metrics) {
    return [
      { label: 'Sun visible', value: '—' },
      { label: 'Mean visible Sun disc', value: '—' },
      { label: 'Longest dark stretch', value: '—' },
      { label: 'Earth in view', value: '—' },
      { label: 'Longest no-Earth stretch', value: '—' },
      { label: 'Sun and Earth together', value: '—' },
    ]
  }

  return [
    { label: 'Sun visible', value: `${fmtNum(metrics.pct_sunlit, 1)} %` },
    { label: 'Mean visible Sun disc', value: `${fmtNum(metrics.mean_sun_frac, 1)} %` },
    {
      label: 'Longest dark stretch',
      value: `${fmtNum(metrics.longest_dark_h, Number.isInteger(metrics.longest_dark_h) ? 0 : 1)} h`,
    },
    { label: 'Earth in view', value: `${fmtNum(metrics.pct_earth, 1)} %` },
    {
      label: 'Longest no-Earth stretch',
      value: `${fmtNum(metrics.longest_no_earth_h, Number.isInteger(metrics.longest_no_earth_h) ? 0 : 1)} h`,
    },
    { label: 'Sun and Earth together', value: `${fmtNum(metrics.pct_both, 1)} %` },
  ]
}

/**
 * Serialises an SVG with computed styles inlined onto attributes
 * so that offscreen canvas Image rendering preserves colors and fonts.
 */
export function inlineSvgStyles(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')

  const origElements = Array.from(svg.querySelectorAll<SVGElement>('*'))
  const cloneElements = Array.from(clone.querySelectorAll<SVGElement>('*'))

  for (let i = 0; i < origElements.length && i < cloneElements.length; i++) {
    const origEl = origElements[i]
    const cloneEl = cloneElements[i]
    try {
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        const style = window.getComputedStyle(origEl)
        if (style) {
          if (style.fill && style.fill !== 'none') cloneEl.setAttribute('fill', style.fill)
          if (style.stroke && style.stroke !== 'none') cloneEl.setAttribute('stroke', style.stroke)
          if (style.strokeWidth && style.strokeWidth !== '0px') {
            cloneEl.setAttribute('stroke-width', style.strokeWidth)
          }
          if (style.strokeDasharray && style.strokeDasharray !== 'none') {
            cloneEl.setAttribute('stroke-dasharray', style.strokeDasharray)
          }
          if (style.opacity && style.opacity !== '1') {
            cloneEl.setAttribute('opacity', style.opacity)
          }
          if (style.fontFamily) cloneEl.setAttribute('font-family', style.fontFamily)
          if (style.fontSize) cloneEl.setAttribute('font-size', style.fontSize)
          if (style.fontWeight) cloneEl.setAttribute('font-weight', style.fontWeight)
          if (style.dominantBaseline) {
            cloneEl.setAttribute('dominant-baseline', style.dominantBaseline)
          }
          if (style.textAnchor) cloneEl.setAttribute('text-anchor', style.textAnchor)
        }
      }
    } catch {
      // Non-fatal fallback for test environments
    }
  }

  if (typeof XMLSerializer !== 'undefined') {
    return new XMLSerializer().serializeToString(clone)
  }
  return clone.outerHTML || ''
}

export function drawSvgToCanvas(
  ctx: CanvasRenderingContext2D,
  svgString: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof Image === 'undefined') {
      resolve()
      return
    }

    try {
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const img = new Image()

      img.onload = () => {
        try {
          ctx.drawImage(img, dx, dy, dw, dh)
          resolve()
        } catch (err) {
          reject(err)
        } finally {
          URL.revokeObjectURL(url)
        }
      }

      img.onerror = (e) => {
        URL.revokeObjectURL(url)
        reject(new Error(`Failed to load SVG into image: ${String(e)}`))
      }

      img.src = url
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Renders the scenario card onto an offscreen 1600x900 canvas.
 */
export async function renderCardToCanvas(
  data: CardExportData,
  opts?: { width?: number; height?: number },
): Promise<HTMLCanvasElement> {
  const width = opts?.width ?? 1600
  const height = opts?.height ?? 900

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context not supported')
  }

  // 1. Dark theme background
  ctx.fillStyle = '#0c1017'
  ctx.fillRect(0, 0, width, height)

  // 2. Header
  const headerX = 60
  const headerY = 70

  // Site name
  ctx.fillStyle = '#f2f5fb'
  ctx.font = 'bold 32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(data.siteName || data.siteId, headerX, headerY)

  // Date range
  const startDateStr = data.startUtc.slice(0, 10)
  const endDateStr = data.endUtc.slice(0, 10)
  const dateText = `${startDateStr} to ${endDateStr} UTC`

  ctx.fillStyle = '#8a99ad'
  ctx.font = '18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText(dateText, headerX, headerY + 34)

  // Badges text: "Synthetic data" / "Approximate"
  let badgeX = headerX + ctx.measureText(dateText).width + 24
  if (data.synthetic) {
    ctx.fillStyle = 'rgba(245, 158, 11, 0.16)'
    const badgeW = 120
    const badgeH = 26
    const badgeY = headerY + 16
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH)
    ctx.strokeStyle = '#f59e0b'
    ctx.lineWidth = 1
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH)

    ctx.fillStyle = '#f59e0b'
    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText('Synthetic data', badgeX + 10, badgeY + 18)
    badgeX += badgeW + 12
  }

  if (data.approximate) {
    ctx.fillStyle = 'rgba(96, 165, 250, 0.16)'
    const badgeW = 104
    const badgeH = 26
    const badgeY = headerY + 16
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH)
    ctx.strokeStyle = '#60a5fa'
    ctx.lineWidth = 1
    ctx.strokeRect(badgeX, badgeY, badgeW, badgeH)

    ctx.fillStyle = '#60a5fa'
    ctx.font = '600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.fillText('Approximate', badgeX + 10, badgeY + 18)
  }

  // 3. Sky plot (left side)
  const skyBoxX = 60
  const skyBoxY = 140
  const skyBoxSize = 680

  ctx.fillStyle = '#161d2e'
  ctx.fillRect(skyBoxX, skyBoxY, skyBoxSize, skyBoxSize)
  ctx.strokeStyle = '#222d42'
  ctx.lineWidth = 1
  ctx.strokeRect(skyBoxX, skyBoxY, skyBoxSize, skyBoxSize)

  if (data.svgElement) {
    try {
      const serialized = inlineSvgStyles(data.svgElement)
      await drawSvgToCanvas(ctx, serialized, skyBoxX + 10, skyBoxY + 10, skyBoxSize - 20, skyBoxSize - 20)
    } catch {
      // In case SVG image draw fails, display notice in sky plot area
      ctx.fillStyle = '#8a99ad'
      ctx.font = '16px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Sky plot', skyBoxX + skyBoxSize / 2, skyBoxY + skyBoxSize / 2)
      ctx.textAlign = 'start'
    }
  } else {
    ctx.fillStyle = '#8a99ad'
    ctx.font = '16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Sky plot', skyBoxX + skyBoxSize / 2, skyBoxY + skyBoxSize / 2)
    ctx.textAlign = 'start'
  }

  // 4. Key Metrics Table (right side)
  const tableX = 780
  const tableY = 140
  const tableW = 760
  const tableH = skyBoxSize

  ctx.fillStyle = '#161d2e'
  ctx.fillRect(tableX, tableY, tableW, tableH)
  ctx.strokeStyle = '#222d42'
  ctx.lineWidth = 1
  ctx.strokeRect(tableX, tableY, tableW, tableH)

  // Table Title
  ctx.fillStyle = '#f2f5fb'
  ctx.font = 'bold 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.fillText('Key scenario metrics', tableX + 32, tableY + 50)

  // Rows
  const rows = extractKeyMetricRows(data.metrics)
  const rowStartY = tableY + 90
  const rowH = 75

  rows.forEach((row, i) => {
    const y = rowStartY + i * rowH

    // Alternating row background
    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'
      ctx.fillRect(tableX + 1, y, tableW - 2, rowH)
    }

    // Border line between rows
    ctx.strokeStyle = '#222d42'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(tableX + 32, y + rowH)
    ctx.lineTo(tableX + tableW - 32, y + rowH)
    ctx.stroke()

    // Metric Label
    ctx.fillStyle = '#8a99ad'
    ctx.font = '18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.fillText(row.label, tableX + 32, y + rowH / 2)

    // Metric Value
    ctx.fillStyle = '#f2f5fb'
    ctx.font = '600 20px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(row.value, tableX + tableW - 32, y + rowH / 2)
    ctx.textAlign = 'start'
  })

  // 5. Footer Line
  ctx.fillStyle = '#8a99ad'
  ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(EXPORT_PNG_FOOTER, headerX, 868)

  return canvas
}

/**
 * Downloads a canvas element as a PNG file.
 */
export async function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas toBlob returned null'))
        return
      }
      try {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        resolve()
      } catch (err) {
        reject(err)
      }
    }, 'image/png')
  })
}

/**
 * Full export flow: renders card to offscreen canvas and triggers download.
 * Fails gracefully by throwing an error that can be caught and displayed in the UI.
 */
export async function exportCardAsPng(data: CardExportData, customFilename?: string): Promise<string> {
  const filename = customFilename || buildPngFilename(data.siteId, data.startUtc)
  const canvas = await renderCardToCanvas(data)
  await downloadCanvasAsPng(canvas, filename)
  return filename
}
