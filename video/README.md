# 30-second submission video

Output (git-ignored): `video/out/lunar-landing-navigator-30s.mp4` (1080p), `...-720p.mp4`,
`poster.png`, `contact-sheet.png`.

## Regenerate

From the repository root, in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File video\make-video.ps1
```

About 5 minutes on the build laptop (capture 2.5 min, compose 1 min, encode 1.5 min).

Options:

```powershell
# public URL and team name on the end card
powershell -ExecutionPolicy Bypass -File video\make-video.ps1 -Url "https://example.org" -Team "Team name"
# only change texts, URL, audio or encoding: reuse the captured frames (about 1.5 min)
powershell -ExecutionPolicy Bypass -File video\make-video.ps1 -SkipCapture -Url "https://example.org"
# re-capture single shots
powershell -ExecutionPolicy Bypass -File video\make-video.ps1 -Only "slip,surface"
```

The script uses the dev server at `-AppUrl` (default `http://localhost:5173`). If nothing answers there
it starts its own Vite dev server from `web/` on port 5390 and stops only that process when done.

## Needs

- Node 20+, Google Chrome, `playwright-core` (looked up in `PW_DIR`, `video/`, then `C:\Dev\pw-tmp`).
- ffmpeg and ffprobe: the winget Gyan.FFmpeg package is found automatically; otherwise set `FFMPEG_DIR`
  to the folder with `ffmpeg.exe`, or have it on `PATH`.
- A **Vite dev server** of the app, not `vite preview`: the capture imports the app's own modules
  (`/src/state/store.ts` etc.) to drive the store and the 3D scene.
- A GPU is used when available (`GL=swiftshader` forces software WebGL; slower, same frames).

## How it works

| Stage | Script | What it does |
|---|---|---|
| 1 | `scripts/capture.mjs` | One browser context per shot. Time is driven by Playwright's fake clock: each output frame advances the page by a fixed step and takes one screenshot, so motion is an exact 30 fps. Real clicks and keys where the viewer sees them; store calls for setup. Writes `work/frames/<shot>/` and `work/meta.json` (cursor path, highlight boxes, values read from the screen). |
| 2 | `scripts/compose.mjs` + `compose.html` | Composites every frame in a 1920x1080 page: camera pans and zooms (UI shots are captured at 2x so zooms stay sharp), highlights, cursor, captions, status chip, dissolves, end card. Writes `work/final/`. |
| 3 | `scripts/audio.mjs` | Synthesises the soundtrack (pad, whooshes on cuts, ticks on clicks, chimes on status flips, bells). |
| 4 | `scripts/assemble.mjs` | ffmpeg: H.264 + AAC, two-pass loudness to -16 LUFS, 720p copy, poster, contact sheet, ffprobe check (fails above 30.0 s). |

## What to tweak

- **Texts and timings:** `scripts/timeline.mjs` (shot lengths in frames, captions, end card). The sum of
  shot lengths must stay at or below 900 frames.
- **What happens in a shot:** the function of the same name in `scripts/capture.mjs`.
- **Look (dim, dissolve length, chip position, camera override):** `LOOK` in `scripts/compose.mjs`;
  typography in `scripts/compose.html`.
- **Music:** chords and event sounds in `scripts/audio.mjs`.

## If the app changes

The capture finds controls by role, label or `data-*` attribute and reads numbers from the screen, so
small polish does not break it. It stops with a named shot if one of these disappears:
`[data-demo="add-menu-toggle"]`, `[data-preset="apollo11_vs_artemis"]`, the `3D` tab, the button titled
"Turn the camera towards the Sun…", `Sunlight map`, `Overview`, `Full screen`, `.slipstrip__cells`,
`.slipstrip__note`, the slip `input[type=range][max=60]`, `.surface__state`.
After every run look at `out/contact-sheet.png` and play the MP4 once.

See REQUIREMENTS.md for the Space Apps rules and STORYBOARD.md for the second-by-second plan.
