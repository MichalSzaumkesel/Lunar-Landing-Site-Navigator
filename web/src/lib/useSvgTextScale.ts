import { useCallback, useLayoutEffect, useRef } from 'react'

/**
 * Keeps SVG text at a constant on-screen size however far the viewBox is
 * stretched. Returns a stable callback ref for the <svg>; it writes `--svg-px`
 * (viewBox units per CSS px) on the element, and the `.svg-scaled` class in
 * theme.css turns that into --fs-tick / --fs-label / --fs-title, sized from the
 * --svg-fs-* tokens.
 *
 * `unit` is the number of viewBox units per local unit for text drawn inside a
 * `scale(...)` group (e.g. the pole map's metre-scaled labels).
 */
export function useSvgTextScale(unit = 1): (svg: SVGSVGElement | null) => void {
  const cleanup = useRef<(() => void) | null>(null)
  const unitRef = useRef(unit)
  useLayoutEffect(() => {
    unitRef.current = unit
  }, [unit])

  return useCallback(
    (svg: SVGSVGElement | null) => {
      cleanup.current?.()
      cleanup.current = null
      if (!svg) return
      const run = () => {
        const vb = svg.viewBox.baseVal
        const box = svg.getBoundingClientRect()
        if (!vb.width || !vb.height || !box.width || !box.height) return
        const scale = Math.min(box.width / vb.width, box.height / vb.height) * unitRef.current
        svg.style.setProperty('--svg-px', String(1 / scale))
      }
      run()
      const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run)
      ro?.observe(svg)
      const mo = new MutationObserver(run)
      mo.observe(svg, { attributes: true, attributeFilter: ['viewBox'] })
      cleanup.current = () => {
        ro?.disconnect()
        mo.disconnect()
      }
    },
    [],
  )
}
