# Task W3a2: remaining security fixes (the rest of W3a is done)

Write the files first, then test. Items 1 to 3 only; do not touch anything else.

## Writable paths

`src/lib/exportCsv.ts`, `src/lib/exportCsv.test.ts`, `src/components/library/SiteLibrary.tsx`, `src/components/library/safeUrl.ts` (new), `src/components/library/safeUrl.test.ts` (new), `vite.config.ts`, `index.html`

## Items

1. `exportCsv.ts` `scenariosToCsv`: any **string** cell (site name, site id, timestamps are fine) whose first character is `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'` before the quoting step; numeric cells are never prefixed (negative numbers stay `-1.5`). First check whether this is already done; if it is, only add the missing test. Tests: `=SUM(A1)` becomes `'=SUM(A1)`, a number `-1.5` stays, a name with commas still quoted.
2. `SiteLibrary.tsx`: show the `Source` link only when `safeHttpsUrl(url)` returns a string; otherwise show the source title as plain text. New `safeUrl.ts` exports `safeHttpsUrl(url: string): string | null`: parse with `new URL` inside try/catch and return `url.href` only when `protocol === 'https:'`, otherwise `null`. Tests: https ok, `javascript:alert(1)` null, `data:text/html,x` null, `http://x` null, garbage null, empty string null. Keep `rel="noopener noreferrer"` and `target="_blank"` on the anchor.
3. `vite.config.ts` and `index.html`: add a Content-Security-Policy `<meta>` tag **only in production builds**: a small Vite plugin with `transformIndexHtml` that returns the tag via `{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: ... }, injectTo: 'head-prepend' }` and is applied only when the config command is `build` (use `apply: 'build'` on the plugin). Content: `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'<plus the origin of process.env.VITE_API_URL when it is set>; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'`. Do not change `index.html` unless needed. Verify: `npm run build` succeeds (up to 3 minutes), `dist/index.html` contains the meta tag, then delete the `dist` folder. Also check `npm run dev` config is unaffected (the plugin must not run in dev).

## Acceptance

`npm run typecheck`, `npm run lint` and `npx vitest run src/lib/exportCsv src/components/library` exit 0. Report per item: done or why not.
