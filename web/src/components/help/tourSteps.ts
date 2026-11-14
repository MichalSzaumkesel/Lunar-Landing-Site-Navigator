export interface TourStep {
  id: string
  target: string
  title: string
  text: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

export const simpleSteps: TourStep[] = [
  {
    id: 'mode-switch',
    target: '[data-tour="mode-switch"]',
    title: 'Mode switch',
    text: 'Simple shows one place in plain words. Advanced shows every tool. Switch any time.',
    placement: 'bottom',
  },
  {
    id: 'simple-places',
    target: '[data-tour="simple-places"]',
    title: 'Places',
    text: 'Pick a place on the Moon.',
    placement: 'bottom',
  },
  {
    id: 'sky-plot',
    target: '[data-tour="sky-plot"]',
    title: 'Sky view',
    text: 'The sky seen from the ground. Gold is the Sun, blue is the Earth, grey is terrain blocking the view.',
    placement: 'right',
  },
  {
    id: 'simple-summary',
    target: '[data-tour="simple-summary"]',
    title: 'Summary',
    text: 'What this means, in words.',
    placement: 'left',
  },
  {
    id: 'transport-play',
    target: '[data-tour="transport-play"]',
    title: 'Playback',
    text: 'Press Play to watch time pass. Drag the slider to jump.',
    placement: 'top',
  },
  {
    id: 'help-button',
    target: '[data-tour="help-button"]',
    title: 'Tutorial',
    text: 'Open this tutorial again here.',
    placement: 'bottom',
  },
]

export const advancedSteps: TourStep[] = [
  {
    id: 'mode-switch',
    target: '[data-tour="mode-switch"]',
    title: 'Mode switch',
    text: 'Simple shows one place in plain words. Advanced shows every tool. Switch any time.',
    placement: 'bottom',
  },
  {
    id: 'presets',
    target: '[data-tour="presets"]',
    title: 'Presets',
    text: "One-click setups. The first compares the Moon's equator with the south pole.",
    placement: 'bottom',
  },
  {
    id: 'observer-height',
    target: '[data-tour="observer-height"]',
    title: 'Observer height',
    text: 'How high the viewer stands above the ground: 2 m for a lander deck, 10 m for a mast. A higher viewpoint sees over more terrain.',
    placement: 'bottom',
  },
  {
    id: 'tools',
    target: '[data-tour="tools"]',
    title: 'Tools',
    text: 'Copy link shares exactly this view. Export CSV saves the numbers. Sound plays short tones at sunrise and sunset; it is off by default.',
    placement: 'left',
  },
  {
    id: 'scenario-cards',
    target: '[data-tour="card-header"]',
    title: 'Scenario cards',
    text: 'Each card is one site and one date window. Change the site or the dates here to compare. Add up to four cards.',
    placement: 'bottom',
  },
  {
    id: 'view-tabs',
    target: '[data-tour="view-tabs"]',
    title: 'Views',
    text: 'Polar: the sky seen from above, rim is the horizon and the centre is the elevation named in the Zoom label under the plot (straight up only at 90°). Panorama: the horizon unrolled. 3D: the terrain with moving shadows.',
    placement: 'bottom',
  },
  {
    id: 'sky-plot',
    target: '[data-tour="sky-plot"]',
    title: 'Sky plot',
    text: 'The sky seen from the ground. Gold is the Sun, blue is the Earth, grey is terrain blocking the view.',
    placement: 'right',
  },
  {
    id: 'loupe',
    target: '[data-tour="loupe"]',
    title: 'Horizon loupe',
    text: 'A close-up of the horizon at the Sun: the ridge cutting the disc shows how much of the Sun is visible.',
    placement: 'left',
  },
  {
    id: 'timeline',
    target: '[data-tour="timeline"]',
    title: 'Timeline',
    text: 'Bands show when the Sun is visible, when Earth is in view, and both. Drag to move in time; arrow keys step one hour.',
    placement: 'top',
  },
  {
    id: 'chips',
    target: '[data-tour="chips"]',
    title: 'Event chips',
    text: 'Jump straight to a sunset, sunrise, Earth set or Earth rise.',
    placement: 'top',
  },
  {
    id: 'countdowns-metrics',
    target: '[data-tour="countdowns-metrics"]',
    title: 'Countdowns and metrics',
    text: 'Time to the next sunset and Earth set, and the share of time with the Sun visible and Earth in view over the window.',
    placement: 'top',
  },
  {
    id: 'scenario-controls',
    target: '[data-tour="scenario-controls"]',
    title: 'Scenario controls',
    text: "Pick the start date and the window length. Slip moves the window up to 60 days either way, to answer 'same place, later date'.",
    placement: 'top',
  },
  {
    id: 'transport-play',
    target: '[data-tour="transport-play"]',
    title: 'Transport bar',
    text: 'Play animates all cards together. Space plays and pauses; arrow keys step one hour, with Shift one day.',
    placement: 'top',
  },
  {
    id: 'panels',
    target: '[data-tour="panels"]',
    title: 'Panels',
    text: 'Window map shows which site and landing date fit your mission rules; set the rules above it. Moon map shows the sites with day and night. The library lists every site with its source.',
    placement: 'top',
  },
  {
    id: 'help-button',
    target: '[data-tour="help-button"]',
    title: 'Tutorial button',
    text: 'Open this tutorial again here.',
    placement: 'bottom',
  },
]

/**
 * Searches for the next available step in direction (1 or -1) where exists(target) is true.
 * Returns the index, or -1 if no step in that direction is available.
 */
export function nextAvailableStep(
  steps: readonly TourStep[],
  index: number,
  direction: 1 | -1,
  exists: (target: string) => boolean,
): number {
  let cur = index + direction
  while (cur >= 0 && cur < steps.length) {
    if (exists(steps[cur].target)) {
      return cur
    }
    cur += direction
  }
  return -1
}

/**
 * Pure predicate deciding whether the guided tour should automatically pop up.
 */
export function shouldAutoStart(storageValue: string | null, suppressed: boolean): boolean {
  if (suppressed) {
    return false
  }
  return storageValue !== 'done'
}
