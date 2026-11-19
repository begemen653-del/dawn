# Dawn — Nightly pipeline

Runs in GitHub Actions (`.github/workflows/nightly.yml`) at about **04:30 Europe/Berlin**, and on demand via
**Actions → Nightly brief → Run workflow**.

## Stages

| #   | Stage     | Code                                                 | Status | What it does                                                                     |
| --- | --------- | ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| 1   | Sources   | `pipeline/src/sources/`                              | M3 ✅  | GDELT bulk files + 34 curated feeds; robots.txt, User-Agent, ETag cache, retries |
| 2   | Normalize | `sources/gkg.ts`, `sources/rss.ts`, `events/text.ts` | M3 ✅  | Clean headlines, canonical URLs, languages, countries, places, topics, names     |
| 3   | Events    | `events/cluster.ts`                                  | M3 ✅  | Remove duplicates, group articles into events, merge across languages            |
| 4   | Rank      | `events/rank.ts`                                     | M3 ✅  | Importance by independent coverage; sport/celebrity pushed down                  |
| 5   | Chapters  | `events/assign.ts`                                   | M3 ✅  | Global, 7 regions, 232 countries; honest empty chapters                          |
| 6   | AI        | `pipeline/src/ai/`, `run/brief.ts`                   | M4 ✅  | Summary, why it matters, relevance check, scene, deeper content, Learn card      |
| 7   | Geo       | `pipeline/src/geo/`                                  | M6 ✅  | Bundled gazetteer: state pins snapped to their city, cities found in headlines   |
| 8   | Images    | `pipeline/src/images/`                               | M7     | Licensed images only — see `IMAGES.md`                                           |
| 9   | Write     | `pipeline/src/run/`                                  | M1 ✅  | Validate with zod, write atomically, write `status.json`                         |

Commands:

- `npm run pipeline:ingest` — real news → `pipeline/out/ingest.json` (input for the AI step), `report.md`
  (readable top stories per chapter) and `status.json`. About 40–75 seconds on a PC.
- `npm run pipeline:live` — ingest + AI → the real brief in `web/public/data/latest/` (needs keys, see README).
- `npm run pipeline:mock` — the same flow with a fake AI that reuses headlines (no keys; for testing).
- `npm run pipeline:dry` — the old sample brief.

## Sources

### GDELT (worldwide backbone)

GDELT's **Global Knowledge Graph** lists every news article it saw worldwide in 15-minute batches, with the
headline, the places it mentions (with coordinates), topics, and the people and organisations named. Non-English
outlets come in a separate batch whose tags GDELT has machine-translated (headlines stay in the original
language). We read the free bulk files (`data.gdeltproject.org/gdeltv2/`): no key and no request limit.

- **Sampling:** one batch per hour over the last 24 hours, English + translated (≈ 48 files, ≈ 290 MB download,
  ≈ 70,000 articles). Big stories appear in many batches, so they're still found. Change with
  `DAWN_GDELT_STEP_MINUTES` (15 = every batch) or turn off the translated batch with `DAWN_GDELT_TRANSLATED=0`.
- **Not used:** GDELT's search API (DOC 2.0). It answers "Please limit requests to one every 5 seconds" whenever
  it is busy, even with 20-second pauses (confirmed by others), so it can't be relied on nightly.
- **Terms:** GDELT is free and open; it asks for a citation, which the Sources page (Milestone 8) will give.

### Curated feeds (`config/sources.ts`)

Hand-picked outlets for the priority places, ranked a little higher than GDELT-only coverage. Adding coverage
for a country means adding one entry with its ISO2 code in `scopes`.

| Scope                        | Feeds                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| Global                       | BBC World, Guardian World, Al Jazeera, DW, France 24, NPR World            |
| Tech / economy               | BBC Technology, Guardian Technology, Ars Technica, BBC & Guardian Business |
| Europe                       | BBC Europe, Guardian Europe, DW Europe, Euronews, Politico Europe          |
| Germany                      | Tagesschau, DW Germany                                                     |
| Türkiye                      | Anadolu Agency (English), Hürriyet Daily News, TRT Haber, bianet           |
| Asia                         | BBC Asia, The Hindu, South China Morning Post, NHK                         |
| Americas                     | BBC US & Canada, NPR News, BBC Latin America                               |
| Middle East, Africa, Oceania | BBC regional feeds, ABC News (Australia)                                   |

Checked Nov 2026: every feed responds. robots.txt is checked on every run (with correct `*` and `$` matching)
and a refusal skips that feed with a warning. Dropped: TRT World (no working English feed), CNA (its feed sits
under `/api/`, which its robots.txt disallows).

#### Feed terms

We only read **headline, link and time**. Nothing from the article is stored or shown; the app shows our own AI
summary and links to the original.

| Outlet(s)    | What their terms say (checked Nov 2026)                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| BBC          | Personal, non-commercial use; credit "BBC News" with a link (bbc.com/pages/terms-of-use §1, §12)       |
| The Guardian | Personal, non-commercial use in a feed reader, under its terms of service (theguardian.com/help/feeds) |
| NPR          | Personal, non-commercial use under its Terms of Use, content-feed section                              |
| DW, others   | Public feeds; written terms not found or not reviewed yet — **to confirm**                             |

**Open questions for you (not legal advice):**

1. All of these allow _personal, non-commercial_ use. Dawn fits that only while it stays your private app. If it
   is ever shared or made public, the feed list must be reviewed again.
2. The BBC's terms also say you may not "pluck metadata" from its content or feeds. Reading headlines and links
   in a personal reader is what feeds are for, but this sentence is unclear. If you want zero doubt, the BBC feeds
   can be removed: GDELT still covers those stories.

## How events are built

1. **Duplicates:** the same URL, or the same headline on the same site, is kept once (curated copies win).
2. **Site boilerplate:** words a site puts in most of its headlines ("– Haber Sitesi") are ignored, so they can't
   glue unrelated stories together.
3. **Grouping:** single pass; each article joins the most similar group (TF-IDF cosine ≥ 0.38 against the group's
   centre, built from headline words plus GDELT's names and places) or starts a new one.
4. **Merging:** groups describing the same event, including in different languages (linked by shared people,
   organisations and places), are merged most-similar first, re-checking each merge so chains can't snowball.
5. **Voices:** copies of one wire story on 70 local sites count as one voice.
6. **Score (0–100):** distinct voices, curated outlets, languages and source countries; a little recency;
   sport/celebrity ×0.6.
7. **Chapters:** an event is "about" a country when at least half of its voices mention it. Regions use the home
   region of those countries. Global needs independent coverage across languages/countries or by the curated
   global outlets. Every chapter needs 2+ outlets per story; empty chapters say so.

Known limits (handled in Milestone 4): GDELT's place tags are sometimes wrong (a US flood tagged Germany), so the AI
step will confirm each story really concerns its chapter before it's shown.

## AI step (Milestone 4)

1. **Order:** events are processed in chapter priority (Global → regions → big countries → others), so if the
   daily budget runs out, only the least-viewed chapters get fewer stories.
2. **Reading:** for each event, up to 3 source articles from different outlets (hand-picked and English first) are
   read with Mozilla Readability, respecting robots.txt. Only a ~1,600-character excerpt is kept, in memory, as
   input. It is never stored or shown. About 80% of articles are readable (the rest are paywalled or refuse);
   for those the AI sees the headline only.
3. **Writing:** ~6 events per request. The system prompt carries the accuracy rules (sources only, no invented
   numbers/names/quotes, say when sources disagree, attribute claims, neutral, flag developing stories, own
   words). "Go deeper" is written at the same time for Global, region and top big-country stories.
4. **Checks:** every answer must match the schema (`ai/drafts.ts`) and pass the grounding check
   (`ai/grounding.ts`): every number and quote must be in the sources, and at most one unknown name. Failing
   stories are retried alone with the problems listed, then dropped.
5. **Places:** the AI picks place ids and countries from candidate lists built from GDELT tags; the globe scene
   (camera, markers, highlights, routes, areas) is built in code from our coordinates (`ai/scene.ts`), so it can
   never invent a location.
6. **Relevance:** a story stays in a country chapter only if the AI confirms it is really about that country.
7. **Publishing:** stories and chapters are written first, the index last. With fewer than 10 stories the old
   brief stays and the run fails (GitHub emails you).

### Providers and free limits (checked Nov 2026)

| Provider   | Models (in order, overridable by env)     | Free limits                                                                                                                                 |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Gemini     | 3.8 Flash, 3.5 Flash-Lite, 2.5 Flash-Lite | Per account, shown in AI Studio (Google no longer publishes them). EU users get the paid-tier data terms: inputs are not used for training. |
| Groq       | Llama 4 Scout, Kimi K2, Llama 3.3 70B     | e.g. Scout 30 req/min, 30k tokens/min, 1,000 req/day, 500k tokens/day; each model has its own allowance                                     |
| OpenRouter | Llama 3.3 70B (free)                      | 20 req/min, 50 req/day without buying credits                                                                                               |

Each model is paced under its per-minute limits; a "429 / quota" answer moves to the next model for the rest of
the run. A hard daily cap (`DAWN_AI_TOKEN_BUDGET`, default 1.5 M tokens) stops AI calls before free limits are
exceeded. Expected nightly use: ~110 requests, ~0.9–1.3 M tokens, 10–35 minutes.

**Go deeper split (proposal):** pre-written for Global, all regions and the top 3 stories of each big country
(about 100–150 stories a night). Other stories show "more background will be written on request"; writing those
on demand would need a small server function holding the AI keys; Dawn is a static site on GitHub Pages, so this
is not built (an option for later).

## Places on the globe (Milestone 6)

Coordinates never come from the AI: it only picks from a candidate list built here (`ai/summarize.ts`,
`geo/`).

- GDELT gives most places with coordinates. GDELT often files a city under the state of the same name
  ("New York" the state), which put pins in the state's middle. `geo/places.ts` moves such a pin to the city
  when a city of that exact name with 500,000+ people exists in that country.
- Events from RSS feeds come without places, so cities named in their headlines are added as candidates, using
  the bundled gazetteer `pipeline/data/gazetteer.json` (~7,300 Natural Earth places, public domain, built by
  `npm run geo`). Only cities of 100,000+ people (or well-known ones) in the event's own countries count, and
  common words that are also city names ("Nice", "Mobile", "Reading") are skipped.
- Stories pin cities and regions; a whole country is shown by its highlight, not by an extra pin. Cities get a
  deep zoom (~7.2), regions ~5.4.

## When it runs: morning brief and evening update

- **Morning brief, 04:30 Berlin:** the full brief from the last 24 hours (`npm run pipeline:live`), ready by
  about 05:45. Uses most of the free daily AI allowance (~1–1.5 M tokens).
- **Evening update, 18:00 Berlin:** `npm run pipeline:evening` (`run/evening.ts`) reads the news since the
  morning brief, picks up to 16 important new events (Global, regions, big countries) whose articles weren't
  already sources of a morning story, writes them, drops repeats of morning stories and adds up to 10 to the top
  of their chapters (chapters stay at 8). Capped at 250k tokens and 30 minutes; the first real run (2026-11-19)
  used 49k tokens and added 5 stories. Nothing changes if nothing is new or there is no brief for today.
- **Punctual start:** GitHub's own schedule starts runs ~6–9 hours late (briefs landed 11:45–13:11), so an
  outside timer on cron-job.org (free) starts the workflow at 04:30 (`kind: morning`) and 18:00
  (`kind: evening`) through the GitHub API, with a fine-grained token that can only run this repo's
  Actions. GitHub's schedule stays as a backup; the gate builds at most one morning brief a day.
- **Free AI quota days:** Gemini's daily limits reset at 09:00 Berlin, so an evening update and the next
  morning brief share one quota day; the evening cap keeps enough for the morning.

## Reliability rules

- One failing feed, GDELT batch or AI provider never stops the run; it becomes a warning in `status.json`.
  The run fails only if no source delivers anything.
- If the run fails, nothing is committed and the app keeps the previous brief with its "last updated" time.
- Runs are idempotent: the same inputs give the same output.
- GitHub emails the repo owner when a scheduled workflow fails (check _Settings → Notifications → Actions_).

## Free-tier budget

| Resource                   | Free limit                  | Our use                               |
| -------------------------- | --------------------------- | ------------------------------------- |
| GitHub Actions (private)   | 2,000 min/month             | ~3–5 min/night ≈ 150 min/month (M3)   |
| GitHub Actions cache       | 10 GB per repo              | feed cache only, a few MB             |
| GDELT bulk files           | free, no key, no rate limit | ≈ 290 MB/night                        |
| Gemini / Groq / OpenRouter | verified in M4              | M4                                    |
| Nominatim                  | 1 request/second max        | not needed so far (gazetteer + GDELT) |
| GitHub Pages (public repo) | 1 GB site, 100 GB/month     | ~10 MB site, a few MB/day             |
