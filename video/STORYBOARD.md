# Storyboard: 30-second submission video

29.93 s, 1920x1080, 30 fps, no voice-over, burned-in English captions, original synthesised audio.
The single source of truth for timings and texts is `scripts/timeline.mjs`; this file describes it.
Values in *italics* are read from the running app at capture time.

| Time (s) | Shot id | Picture (real app, real clicks or store state) | On-screen text | Sound |
|---|---|---|---|---|
| 0.0 - 3.5 | `hook` | 3D first-person view, full screen, Artemis candidate region (Mons Mouton Plateau). Camera locked on the Sun (the app's hold-to-lock). Time runs at about 8 h per second: the Sun slides along the real LOLA ridge and the app's status flips at 2.8 s. | "Lunar south pole: the Sun only skims the horizon" / "Real NASA LOLA terrain · Sun position from JPL Horizons". Chip mirroring the app: "Sun visible" then "Sun below horizon". | Low swell, dark pad, two-note chime on the flip |
| 3.5 - 5.4 | `hook` | Same view going dark, dimmed and blurred. | "Missions slip." / "New date: will the Sun be visible? Will Earth be in view?" | Whoosh |
| 5.4 - 6.5 | `hook` | Same. | Title: "Lunar Landing Site Navigator" / "Compare landing sites and dates in seconds" | Bell |
| 6.5 - 9.6 | `compare` | Advanced mode. Cursor opens the Add scenario menu, picks **Apollo 11 vs South Pole**, presses **Play**. Two cards side by side. | "One click: equator vs south pole, same dates" | Brighter chord, ticks on clicks |
| 9.6 - 13.0 | `compare` | Push in on the south-pole card: countdown tiles, polar sky plot and loupe change as time plays (72 h per second), then pull back to both cards. | "Sun visible and Earth in view flip live as time plays" | |
| 13.0 - 15.1 | `slip` | Preset **Same site, 14 days later**. Zoom on the two Sun visible tiles, highlighted. | "Same site, 14 days later: Sun visible *6.8 %* → *94.0 %*" | Whoosh |
| 15.1 - 18.0 | `slip` | Pan to **Dates and slip**: slip slider stepped with the keyboard, slip tolerance strip highlighted. | "Slip tolerance: every slip from −60 to +60 days" / *"Mission rules hold for slips from +12 to +19 days."* | |
| 18.0 - 21.7 | `surface` | 3D on the surface at the IM-2 site, lander in view. Cursor holds **Face the Sun** until it reads "Locked on the Sun"; the camera turns and follows the Sun to sunset; status flips. | "Stand on the surface · hold to lock on the Sun". Chip: "Sun visible" then "Sun below horizon". | New chord, tick, chime on the flip |
| 21.7 - 24.5 | `sunmap` | **Sunlight map** in the Overview camera, full screen, slow orbit. | "Sunlight map: share of the window with Sun visible" / "Approximate: local terrain patch" | Whoosh |
| 24.5 - 26.0 | `simple` | **Simple** mode with the timeline playing. | "Simple mode for classrooms and the public" | Whoosh |
| 26.0 - 29.9 | `end` | Still from the hook, slow push-in, dimmed. | "Lunar Landing Site Navigator" / "Real NASA LOLA terrain + JPL Horizons" / "*43/43* validation checks pass" / `VIDEO_URL` (omitted when empty) / "[team ·] NASA Space Apps Challenge 2026 · Rzeszów" / AI-use line | Resolved chord, bell, fade out |

## Rules followed

- Only "Sun visible" and "Earth in view"; nothing about power, energy or radio link.
- Every number comes from the app or `data/validation.json` at capture time (see REQUIREMENTS.md).
- Caption text is 52 px bold at 1080p (about 5 % of the frame height), sub-lines 31 px: readable on a phone.
- If a site shown ever becomes synthetic, the app's own `Synthetic data` badge is in the captured picture;
  add "(demo data)" to the caption in `timeline.mjs` in that case.

## The public URL

The end card shows the URL only when it is passed in:
`make-video.ps1 -Url "https://..."` (or the `VIDEO_URL` env var). **Not decided yet, so the current
render has no URL line.** Adding it needs only `-SkipCapture` (about 1.5 min).
