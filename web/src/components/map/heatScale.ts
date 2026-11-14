/** Colour scale of the illumination heatmap (dark purple = rarely sunlit, yellow = often). */
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [13, 8, 41]],
  [0.25, [91, 26, 109]],
  [0.5, [182, 57, 79]],
  [0.75, [241, 128, 31]],
  [1, [252, 220, 74]],
]

export function heatColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t))
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1]
      const [t1, c1] = STOPS[i]
      const f = (x - t0) / (t1 - t0)
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * f)) as [number, number, number]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

export const HEAT_GRADIENT = `linear-gradient(to right, ${STOPS.map(
  ([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`,
).join(', ')})`
