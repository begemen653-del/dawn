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

## Hosting: GitHub Pages (free)

- The repo is public (since 2026-11-15), so GitHub Pages is free: https://begemen653-del.github.io/dawn/.
- `pages.yml` publishes after every push and after every nightly brief. The site lives in the `/dawn`
  folder; see [ANDROID.md](ANDROID.md) for how paths handle that.
- Purely static: no server functions. "Go deeper" text that wasn't pre-written stays "written on request"
  for now (on-demand writing would need a server with the AI keys).
- The Android app (Capacitor) opens this site; see [ANDROID.md](ANDROID.md).

## Tooling decisions

- **TypeScript 6.0** (not 7.0): `typescript-eslint` does not support TS 7 yet, and lint must pass.
- **ESLint 9.39** (not 10): `eslint-config-next` depends on React/import plugins that don't support ESLint 10 yet.
- **Serwist** (`@serwist/turbopack`) generates the service worker at build time; `web/scripts/copy-sw.mjs`
  copies it to `/sw.js` so it controls the whole site on any static host (no `Service-Worker-Allowed` header
  needed). It is off in `next dev`.

## Offline (Milestone 5)

- **The app** (pages, code, CSS, reading fonts, map shapes, flag font, icons) is precached by the service
  worker on first visit and opens without a connection.
- **The brief** is kept out of the precache. The app saves it itself in Cache Storage (`web/src/lib/brief.ts`):
  one cache per brief, named `dawn-brief:<generatedAt>`, holding `events.json`, every chapter file and
  `index.json` (written last, so a cache without it is an unfinished download and is ignored). After a new
  brief is fully saved, older ones are deleted, so only one day (~1.5 MB) is ever kept.
- **On open**, the saved brief shows at once; the app then checks the network. A newer brief replaces the
  screen only if the reader hasn't moved past the first story, otherwise a "New brief ready · Show" button
  appears. It checks again when the connection returns or the app comes back to the foreground.
- **Age**: the bottom-left label reads "Today, 04:31" / "Yesterday, 04:31" (yesterday and older in the warm
  accent) and "Offline · saved" when the device has no connection.
- Cache Storage needs https or localhost, so offline can't be tried on the phone over `npm run dev:phone`
  (plain http); it works once the app is deployed (M8).
- **Flag emojis**: Windows can't draw them, so a 78 KB self-hosted flag font (Twemoji, CC BY 4.0) loads only
  where needed (`web/public/fonts/`).
- Fonts (Newsreader for headlines, Public Sans for everything else) are downloaded at build time by `next/font` and served from our own domain: no runtime
  requests to Google.

## The app (phone first)

- **Layout:** the globe fills the whole screen. The story card floats at the top, a picture strip and the
  controls at the bottom; the globe keeps the story's location centered in the free space between them. On
  wide screens the card moves to the top-left and pictures to the right.
- **Globe (Milestone 6):** `Globe.tsx` picks one of two globes.
  - `MapGlobe.tsx`: the full globe (MapLibre GL 6, WebGL, globe projection) on free OpenFreeMap vector tiles
    (OpenStreetMap data, no key, no request limit; the credit sits behind the small (i) button). It flies between
    stories with `flyTo` (zooms out for far jumps, then dives in), down to city level (zoom ~7) with borders,
    state lines and place names. The look is in `map-style.ts` (greyscale, one warm accent). Story shapes come
    from `scene-geo.ts`: highlighted countries (bundled Natural Earth borders, faded out up close), shaded areas,
    routes that draw themselves in after the camera arrives, and pins drawn as map layers so the map's own labels
    make room. The map code (~1 MB) loads only when used; its worker is copied to `public/maplibre/` by
    `scripts/copy-maplibre-worker.mjs` before `dev` and `build`.
    Depth (Nov 2026, after "it looks flat"): relief shading from the free AWS "Terrain Tiles" elevation data
    (raised 3D terrain was tried and dropped: it doubled downloads, so detail arrived late); the camera tilts as
    it comes down (`pitchFor`: flat over the whole Earth, up to 40° at city level); the zoomed-out planet gets light and shadow (`.dawn-shade`, placed over the sphere
    every frame); below zoom 5.5 continents, borders, country names and ~2,400 city names come from the
    app's own data (`NAMES_UNTIL`), so the globe looks complete before any tile arrives; when zoomed out, so a fast flight never
    shows an empty disc; outlines crossing the date line are unwrapped (`unwrapGeometry`) so no rings appear.
  - `CanvasGlobe.tsx`: the light 2D canvas globe (d3-geo) on bundled Natural Earth data in `web/public/geo/`
    (built by `npm run geo`). Used when there is no WebGL, when offline (map tiles need the network), when the map
    fails to load within 15 s, or after two flights below 22 fps; the choice sticks for the visit. `?globe=simple`
    forces it.
- **Choose your news:** `web/src/components/picker/`. Selection and order live in `localStorage`
  (`dawn.preferences`, versioned, validated on load). Global is implied and always played last.

## Privacy

No accounts, analytics or tracking. Preferences (chapters, order, voice, streak) live only in the browser's local
storage. The only third-party requests the app will make are map tiles and licensed image thumbnails.

## Future (designed for, not built)

Smart reminders, quick capture, Tether integration, personal topics, more languages. Schemas are versioned and the
pipeline stages are independent modules so these can be added without rewrites.
