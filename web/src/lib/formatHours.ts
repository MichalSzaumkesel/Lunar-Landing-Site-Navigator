/**
 * Cursor offset in hours. The scrubber moves in 0.25 h steps, so show up to two
 * decimals and drop trailing zeros: 576, 576.25, 576.5, 576.75.
 */
export function formatCursorH(h: number): string {
  const v = Math.round(h * 100) / 100
  return v.toFixed(2).replace(/\.?0+$/, '')
}
