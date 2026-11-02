# Dawn — Architecture

Dawn has **no always-on server**. A nightly job writes static JSON files; the web app only reads them.

```
                ┌──────────────── GitHub Actions (nightly, ~04:30 Berlin) ────────────────┐
 GDELT ──┐      │                                                                          │
 RSS ────┼──▶ sources ─▶ normalize/dedupe ─▶ events (cluster + rank) ─▶ ai (summarize ONCE  │
         │      │                                                  per event, scene, deeper)│
         │      │        geo (gazetteer → Nominatim)   images (licensed only)              │
         │      │                     │                     │                              │
         │      │                     ▼                     ▼                              │
         │      │      web/public/data/latest/{index,events}.json + playlists/<scope>.json │
         │      └───────────────────────────────── git commit ─────────────────────────────┘
                                                      │
                                                      ▼  push triggers redeploy
                                     Vercel (static site, free Hobby plan)
                                                      │
                                                      ▼
                         Next.js PWA in the browser: reads JSON, caches it offline
```

## Event-centric processing (why it stays free)

Articles are clustered into **events** first. Each event is summarized by the AI **once** and stored in
`events.json`. Every region/country playlist just lists event ids. AI cost therefore grows with the number of
distinct events per day (target: a few hundred), not with the number of countries.

## Repository layout

| Folder      | What it is                                                                          |
| ----------- | ----------------------------------------------------------------------------------- |
| `config/`   | Regions, the country catalog (generated from Natural Earth), news sources per scope |
| `pipeline/` | Nightly job: `sources`, `events`, `ai`, `geo`, `images`, `schema`, `run`            |
| `web/`      | Next.js (App Router, static export) PWA                                             |
| `scripts/`  | One-off generators: `build-countries.ts`, `build-icons.ts`                          |
| `docs/`     | This file, `PIPELINE.md`, `IMAGES.md`                                               |

`config` and `pipeline` are npm workspaces imported directly as TypeScript (no build step). The web app imports
only `@dawn/config` and the zod schemas from `@dawn/pipeline/schema`.

## Data contracts

All stored JSON is validated with zod schemas in `pipeline/src/schema/` and carries `schemaVersion` (currently
`1`). The pipeline validates before writing (atomic temp-file + rename); the app validates again after loading,
so a damaged file shows a friendly error instead of a broken page.

- `latest/index.json` — `DayIndex`: date, generation time, list of chapter files, the Learn card.
- `latest/events.json` — `EventStore`: every `StoryEvent` of the day (summary, why it matters, sources,
  locations, `SceneDirective`, images, optional "Go deeper").
- `latest/playlists/<scope>.json` — `Playlist`: 0–8 event ids for a region id or country ISO2 code; an empty
  playlist must carry `emptyReason`.
- `status.json` — `RunStatus`: ok flag, counts, warnings, errors.

The **scene directive** is a closed, strict union (`marker`, `highlight`, `arc`, `area`, `timelineStep`, plus a
camera). Unknown types or keys are rejected, so the AI can never make the globe do something unplanned.

## Hosting: Vercel Hobby (free)

- The repo is **private**; GitHub Pages on a private repo needs a paid GitHub plan. Vercel Hobby deploys private
  repos for free (personal, non-commercial use).
- Every nightly commit redeploys the site automatically.
- Vercel Functions on the same free plan can serve lazy "Go deeper" content later (limits verified in
  Milestone 4 before relying on them).

## Tooling decisions

- **TypeScript 6.0** (not 7.0): `typescript-eslint` does not support TS 7 yet, and lint must pass.
- **ESLint 9.39** (not 10): `eslint-config-next` depends on React/import plugins that don't support ESLint 10 yet.
- **Serwist** (`@serwist/turbopack`) generates the service worker at build time.
- **Flag emojis**: Windows can't draw them, so a 78 KB self-hosted flag font (Twemoji, CC BY 4.0) loads only
  where needed (`web/public/fonts/`).
- Fonts (Manrope, Sora) are downloaded at build time by `next/font` and served from our own domain: no runtime
  requests to Google.

## Privacy

No accounts, analytics or tracking. Preferences (chapters, order, voice, streak) live only in the browser's local
storage. The only third-party requests the app will make are map tiles and licensed image thumbnails.

## Future (designed for, not built)

Smart reminders, quick capture, Tether integration, personal topics, more languages. Schemas are versioned and the
pipeline stages are independent modules so these can be added without rewrites.
