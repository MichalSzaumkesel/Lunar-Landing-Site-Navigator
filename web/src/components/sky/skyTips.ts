// Tooltips carry the contract definitions (docs/contract.md, sections 1 and 3).
export const TIP = {
  az: 'Azimuth from local north, clockwise: N 0, E 90, S 180, W 270 deg.',
  el: 'Elevation of the body centre above the local horizontal plane of the reference sphere. No refraction.',
  clear: 'Clearance: elevation of the body centre minus the terrain horizon elevation at its azimuth.',
  frac:
    'Visible disc fraction: 0.5 + (x * sqrt(1 - x^2) + asin(x)) / pi, with x = clamp(clearance / angular radius, -1, 1). The horizon is treated as locally straight across the disc.',
  sun: 'Sun visible: the visible disc fraction is at least 50 %, i.e. the Sun centre is above the terrain horizon.',
  earth: 'Earth in view: the visible disc fraction is at least 50 %, i.e. the Earth centre is above the terrain horizon.',
  phase:
    'Derived from the Sun-Earth angle as seen from the site: lit share = (1 - cos(angle)) / 2. Approximate, no libration or shading effects.',
} as const
