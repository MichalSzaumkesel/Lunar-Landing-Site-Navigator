# Task W8b: cinematic camera in demo mode and a one-click 30 s video recorder (runs after W7a and W7c)

Write the files first, then test (see `_common.md`; follow `tasks/UI-guidelines.md`, `RULES-quality.md`). The submission needs a 30 second video, so the app should be able to produce it. Read what W7a (demo mode, `src/components/demo/**`) and W7c (3D view) produced first.

## Writable paths

`src/components/demo/**`, `src/viz3d/scene.ts` and `SurfaceView.tsx` (only camera control hooks), `src/lib/recorder.ts` and test (new). Nothing else.

## Items

1. **Cinematic camera.** Expose from the 3D scene a small imperative API `cameraTo({ azimuthDeg, elevationDeg, durationMs })` (eased, cancelled by any user input, no animation under `prefers-reduced-motion`). In demo mode the 3D step uses it: first look toward the Sun's current azimuth, then slowly pan to the Earth's azimuth while Play advances time; values come from the ephemeris at the cursor (existing helpers), never typed.
2. **Video script mode.** In the demo caption bar add a "Video 30 s" variant: the same steps but timed to total 30 s (choose step durations from a table in `src/components/demo/videoScript.ts`, a pure function `planVideoSteps(totalMs)` that scales step durations and always ends with the end card showing the project name and "NASA Space Apps 2026"). Captions stay data-driven and follow the wording rule (only "Sun visible" and "Earth in view").
3. **Recorder** (`recorder.ts`): button "Record video" next to it. Uses `navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'browser' }, preferCurrentTab: true })` and `MediaRecorder` with the best supported webm mime type (`isTypeSupported` probe, helper `pickMimeType`). Starts the 30 s video script after a 3 second countdown, stops when it ends or on Esc, then offers the file as a download named `lunar-landing-navigator-demo.webm` (blob URL revoked after use). Clear messages when the API is unsupported or the user declines the share dialog ("Recording needs permission to capture this tab. Nothing was saved."). No data leaves the browser. Hide the recorder UI in the recorded frame as far as the API allows (the caption bar stays).
4. **Tests.** `planVideoSteps` sums to the total within 1 ms for 30000 and 20000, last step is the end card; `pickMimeType` with a mocked `MediaRecorder.isTypeSupported`; error text mapping for unsupported/declined; camera easing helper endpoints.

## Acceptance

`npm run typecheck`, `npm run lint`, `npm test` exit 0. Report per item: done or why not, test counts. State plainly that the actual recording was not run end to end (needs a user permission dialog).
