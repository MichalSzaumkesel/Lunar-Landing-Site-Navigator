export type Placement = 'top' | 'bottom' | 'left' | 'right'
export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Picks the card position: the preferred side first, then the others, taking the first one that does not
 * touch the spotlight; when none is free (tall target on a phone) the one with the least overlap.
 */
export function placeTourCard(
  card: { w: number; h: number },
  spot: Box,
  view: { w: number; h: number },
  preferred: Placement,
  pad: number,
  margin: number,
): { top: number; left: number } {
  const cx = (spot.left + spot.right) / 2 - card.w / 2
  const cy = (spot.top + spot.bottom) / 2 - card.h / 2
  const at = (side: Placement) => {
    let left = cx
    let top = cy
    if (side === 'bottom') top = spot.bottom + margin
    else if (side === 'top') top = spot.top - card.h - margin
    else if (side === 'right') left = spot.right + margin
    else left = spot.left - card.w - margin
    left = Math.max(pad, Math.min(view.w - card.w - pad, left))
    top = Math.max(pad, Math.min(view.h - card.h - pad, top))
    return { top, left }
  }
  const overlap = (p: { top: number; left: number }) => {
    const w = Math.min(p.left + card.w, spot.right) - Math.max(p.left, spot.left)
    const h = Math.min(p.top + card.h, spot.bottom) - Math.max(p.top, spot.top)
    return w > 0 && h > 0 ? w * h : 0
  }
  const opposite: Record<Placement, Placement> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
  const order: Placement[] = [preferred, opposite[preferred]]
  for (const side of ['bottom', 'top', 'right', 'left'] as Placement[]) if (!order.includes(side)) order.push(side)
  let best = at(order[0])
  let bestOverlap = overlap(best)
  for (const side of order) {
    const p = at(side)
    const o = overlap(p)
    if (o === 0) return p
    if (o < bestOverlap) {
      best = p
      bestOverlap = o
    }
  }
  return best
}
