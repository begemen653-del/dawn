# Dawn — notes for Claude

Read this first in a new session. The full spec is the user's master prompt (milestones 1–8); the docs in
`docs/` describe what exists.

## Working with the owner

- Solo builder, no programming knowledge. Explain briefly in plain English; run commands yourself.
- Work milestone by milestone; after each, test, tell them what to click, and wait for "approved".
- Push to GitHub only after a milestone is approved (pushing also enables the nightly workflow changes).
- Android-first (POCO X7 Pro). Design: minimal, professional, greyscale with one warm accent (no colourful UI).
- Everything must stay free. Never put API keys in chat, code or git; they live in `.env.local` (git-ignored)
  and GitHub secrets.

## Status (2026-11-19)

- M1–M6 approved and pushed (M5 offline 2026-11-13; M6 globe 2026-11-19). Next: M7 (images).
- M6: MapLibre globe on OpenFreeMap tiles (`globe/MapGlobe.tsx`,
  canvas globe kept as fallback, `?globe=simple`), gazetteer pins (`pipeline/src/geo/`). Nightlies 16–19 Nov ran fine.
  Pipeline pin fixes show from the next nightly brief.
- Nightly gate fixed 2026-11-13: GitHub starts scheduled runs ~6 h late, so the job now runs if it is past 04:00
  Berlin and today's brief is not on main yet (the old 04:xx-only gate skipped every night).
- 2026-11-15: repo made PUBLIC (free unlimited Actions minutes); history rewritten to the noreply email
  283999149+begemen653-del@users.noreply.github.com (never commit with the gmail address). Nightly push bug fixed
  (detached HEAD); AI stops starting calls after 75 min (`DAWN_TIME_LIMIT_MIN`) so a brief is always saved.
  Manual run 2026-11-15 saved only 34 stories: free AI quotas were spent by the earlier failed runs that day.
- Fact check flags Title-Case headline words as names ("Announces", "Summit") — fix later (M6/M7).
- Keys are in `.env.local` (Gemini, Groq, OpenRouter) and must also be GitHub secrets for the nightly run.
  `npm run pipeline:check-ai` shows which models work.
- Working models (checked 2026-11-03): gemini-3.5-flash-lite (often HTTP 503 "busy"), gemini-3.1-flash-lite,
  gemini-3.5-flash, Groq openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b.
- Full live run 2026-11-12: 434 written, 134 dropped, ~1.5M tokens, AI budget reached. Fact check then relaxed
  (nationalities, institution words, any spelling of a number). Repeated stories are merged after writing
  (`pipeline/src/run/dedupe.ts`): 17 merged → 297 stories. That brief is committed in `web/public/data`.
- Globe keeps fine (50m) shapes during flights when zoomed in; falls back to 110m for a flight if a frame takes
  over 22 ms; labels fade in over 250 ms. Owner confirmed smooth on the phone.
- Planned after M4: optional local model (Ollama, ~3–4B for the GTX 1650 4 GB) as last fallback, laptop runs only.

## Next steps

1. M7 (licensed images). Next.js updated to 16.4.6 on 2026-11-19 (npm audit clean).
2. Check the next nightly brief pins NYC (not NY State) and has headline cities.
3. Owner's choice (2026-11-12): no hosting/install before M8. At M8, deliver an installable Android APK
   (free route, e.g. a Trusted Web Activity / Capacitor wrapper of the deployed app), not just "Add to Home screen".

## Handy commands

`npm run check` (format, lint, types, tests, secret scan) · `npm run dev:phone` (phone on same Wi-Fi:
http://192.168.178.47:3000) · `npm run pipeline:ingest` / `pipeline:mock` / `pipeline:live` / `pipeline:check-ai`.
