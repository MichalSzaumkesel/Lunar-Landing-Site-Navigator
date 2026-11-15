// Single source of truth for the 30 s film: shot order, lengths (frames at 30 fps) and on-screen text.
// Edit texts and timings here; `{name}` placeholders are filled from values the capture step reads
// off the running app (work/meta.json), so no number in the film is typed by hand.
export const FPS = 30

// Shot lengths in frames. Sum must be <= 900 (30.0 s). Currently 898 = 29.93 s.
export const SHOTS = [
  { id: 'hook', frames: 195 }, // 0.0 - 6.5 s  3D south pole, Sun skims the ridge; problem text on top
  { id: 'compare', frames: 195 }, // 6.5 - 13.0 s Apollo 11 vs South Pole preset + Play
  { id: 'slip', frames: 150 }, // 13.0 - 18.0 s same site 14 days later + slip tolerance strip
  { id: 'surface', frames: 110 }, // 18.0 - 21.7 s 3D first person, hold-to-lock on the Sun, sunset
  { id: 'sunmap', frames: 85 }, // 21.7 - 24.5 s Sunlight map, overview orbit
  { id: 'simple', frames: 45 }, // 24.5 - 26.0 s Simple mode
  { id: 'end', frames: 118 }, // 26.0 - 29.93 s end card (background: a still from `hook`)
]

export const TOTAL_FRAMES = SHOTS.reduce((a, s) => a + s.frames, 0)

export function shotStarts() {
  const out = {}
  let f = 0
  for (const s of SHOTS) {
    out[s.id] = f
    f += s.frames
  }
  return out
}

// Captions. `at` and `to` are frames relative to the start of the shot.
// kind: 'lower' (lower third), 'big' (centre, large), 'title' (project title sting).
export const CAPTIONS = [
  { shot: 'hook', at: 6, to: 100, kind: 'lower', text: 'Lunar south pole: the Sun only skims the horizon', sub: 'Real NASA LOLA terrain · Sun position from JPL Horizons' },
  { shot: 'hook', at: 106, to: 160, kind: 'big', text: 'Missions slip.', sub: 'New date: will the Sun be visible? Will Earth be in view?' },
  { shot: 'hook', at: 162, to: 195, kind: 'title', text: 'Lunar Landing Site Navigator', sub: 'Compare landing sites and dates in seconds' },
  { shot: 'compare', at: 4, to: 92, kind: 'lower', text: 'One click: equator vs south pole, same dates' },
  { shot: 'compare', at: 96, to: 192, kind: 'lower', text: 'Sun visible and Earth in view flip live as time plays' },
  { shot: 'slip', at: 3, to: 62, kind: 'lower', text: 'Same site, 14 days later: Sun visible {slipA} → {slipB}' },
  { shot: 'slip', at: 66, to: 147, kind: 'lower', text: 'Slip tolerance: every slip from −60 to +60 days', sub: '{slipNote}' },
  { shot: 'surface', at: 3, to: 107, kind: 'lower', text: 'Stand on the surface · hold to lock on the Sun' },
  { shot: 'sunmap', at: 3, to: 82, kind: 'lower', text: 'Sunlight map: share of the window with Sun visible', sub: 'Approximate: local terrain patch' },
  { shot: 'simple', at: 2, to: 43, kind: 'lower', text: 'Simple mode for classrooms and the public' },
]

// End card. URL comes from the VIDEO_URL env var (omitted when empty); team from VIDEO_TEAM.
export const END_CARD = {
  title: 'Lunar Landing Site Navigator',
  line1: 'Real NASA LOLA terrain + JPL Horizons',
  line2: '{checksPassed}/{checksTotal} validation checks pass',
  footer: 'NASA Space Apps Challenge 2026 · Rzeszów',
  // Space Apps asks teams to mark AI-assisted content; set VIDEO_AI_NOTE=0 to hide this line.
  aiNote: 'Screen capture of our web app · video edit and audio made with AI tools',
}
