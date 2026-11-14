# Review R2: security and privacy

Read `tasks/_review.md` first. Report file: `tasks/reviews/R2-security.md`. For this role only, `npm audit --omit=dev` and `npm ls --omit=dev` may use the network (they only read package metadata).

Scope: the whole app as a static site that loads JSON data files, an optional external API (`VITE_API_URL`), a URL hash with state, `localStorage` (sound preference), workers, external links, and a deploy workflow (`../.github/workflows/deploy-web.yml`). Look for:
- Injection: any `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, string-built URLs or SVG, `href` built from data (site `source.url` must be restricted to `https:`; `javascript:` and `data:` must never reach an anchor), `target="_blank"` without `rel="noopener noreferrer"`.
- Untrusted input: the URL hash parser (`state/urlState.ts`), the custom-site API response (`lib/loader.ts` shape validation: giant arrays, NaN, wrong types), JSON data files (huge `count`, mismatched lengths, prototype pollution via `__proto__` keys in `masks`), coordinates typed by the user.
- Denial of service from a crafted link: a hash that makes the app allocate or loop heavily (durations, counts, 4 scenarios times heavy computations).
- Privacy: any request to a third party, analytics, fonts or CDN scripts, the user's coordinates leaving the browser (they only go to `VITE_API_URL` if set); `localStorage` use and what is stored.
- Supply chain: `npm audit` result, unpinned or odd dependencies, install scripts, the GitHub workflow permissions and action versions (pin by major at least; suggest SHAs if cheap), secrets in the repo (`.env*`, tokens), files that should not be committed.
- Headers and policy for a static host: propose a concrete `Content-Security-Policy` meta tag for `index.html` that works with Vite and workers (list what it blocks), and say what cannot be set from a meta tag.
- The `agy` and runner scripts in `scripts/` (they run with skipped permissions): anything unsafe about how they are written.
Do not report theoretical issues without a realistic path; rank by realistic impact for a public demo site.
