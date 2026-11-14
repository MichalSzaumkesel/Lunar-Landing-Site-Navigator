# Lunar Landing Site Navigator

NASA Space Apps Challenge 2026, local event Rzeszów.

Compare lunar landing **sites and dates** side by side: where the Sun and Earth are relative to the local horizon, how long the Sun stays above the terrain, and when Earth is in view. For mission planners, educators and the public.

## Run it

```bash
cd web
npm install
npm run dev
```

Other scripts: `npm test`, `npm run typecheck`, `npm run build`, `npm run gen:mocks`.

## How it works

- `web/` is a static React + Vite + TypeScript app (D3 sky plot, Three.js terrain view). No backend; it works offline once loaded.
- Data comes from files in `web/public/data/` that follow `docs/contract.md`. Where a site has no real data yet, the app uses clearly labelled synthetic mock data from `web/public/data/mock/` and shows a badge.
- Real data is produced offline by the data pipeline (`pipeline/`, scope A) from NASA LOLA elevation models and JPL Horizons ephemerides.

Wording: the app says "Sun visible" and "Earth in view". It makes no claim about power or communication availability.

## Project layout

| Path | What |
|---|---|
| `CLAUDE.md`, `docs/contract.md` | Shared rules and the data contract between the two work scopes |
| `docs/scope-A-data.md`, `docs/scope-B-web.md` | Scope briefs (data and science, web app and demo) |
| `docs/status-A.md`, `docs/status-B.md` | Progress notes |
| `web/` | The app |
| `pipeline/` | Data pipeline (scope A) |
| `CRITICAL.md` | Cross-scope notices |

## How it was built

Two people, each working with an AI coding assistant team. The web scope lead delegates well-specified boilerplate to a cheaper model (see `web/DELEGATION.md`) and reviews everything it produces.
