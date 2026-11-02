# Dawn — Nightly pipeline

Runs in GitHub Actions (`.github/workflows/nightly.yml`) at about **04:30 Europe/Berlin**, and on demand via
**Actions → Nightly brief → Run workflow**.

## Stages

| #   | Stage     | Folder                  | Status | What it does                                                                          |
| --- | --------- | ----------------------- | ------ | ------------------------------------------------------------------------------------- |
| 1   | Sources   | `pipeline/src/sources/` | M3     | GDELT (worldwide) + curated RSS per country; ETag caching, robots.txt, User-Agent     |
| 2   | Normalize | `pipeline/src/sources/` | M3     | Map everything to the `Article` schema; dedupe by URL and near-identical title        |
| 3   | Events    | `pipeline/src/events/`  | M3     | Cluster articles into events; rank by source count, outlet spread, recency            |
| 4   | Playlists | `pipeline/src/run/`     | M3     | Assign events to regions/countries; 3–8 per chapter, honest empty chapters            |
| 5   | AI        | `pipeline/src/ai/`      | M4     | Summary, why it matters, scene directive, deeper content, Learn card; grounding check |
| 6   | Geo       | `pipeline/src/geo/`     | M6     | Place names → coordinates (bundled gazetteer first, cached Nominatim fallback)        |
| 7   | Images    | `pipeline/src/images/`  | M7     | Licensed images only — see `IMAGES.md`                                                |
| 8   | Write     | `pipeline/src/run/`     | M1 ✅  | Validate with zod, write atomically, write `status.json`                              |

Milestone 1 has only the **dry run**: `npm run pipeline:dry` writes a complete sample brief from
`pipeline/fixtures/sample-brief.ts` with no network or AI calls.

## Reliability rules

- One failing feed or AI provider must not stop the run: each source/provider is wrapped, failures go into
  `status.json` warnings.
- If the whole run fails, nothing is committed and the app keeps showing the previous brief with its "last
  updated" time.
- Runs are **idempotent**: re-running for the same day overwrites the same files with the same content.
- GitHub emails the repo owner when a scheduled workflow fails (check _Settings → Notifications → Actions_ on
  github.com is set to email you).

## Free-tier budget

Filled in Milestones 3–4 after verifying each provider's current limits. Rough target: a few hundred events per
day, one AI call batch per event, staying well under the free daily token/request limits, with a hard daily
budget in code that stops AI calls before a limit is hit.

| Resource                 | Free limit (to verify) | Our planned use               |
| ------------------------ | ---------------------- | ----------------------------- |
| GitHub Actions (private) | 2,000 min/month        | ~10 min/night ≈ 300 min/month |
| Gemini (AI Studio)       | M4                     | M4                            |
| Groq / OpenRouter free   | M4                     | M4                            |
| GDELT DOC API            | M3                     | M3                            |
| Nominatim                | 1 request/second max   | cached, rare                  |
| Vercel Hobby             | M8                     | static + few functions        |
