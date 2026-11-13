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

## Status (2026-11-13)

- M1–M4 approved and pushed (M4 approved 2026-11-12). M5 (offline) built 2026-11-13, committed locally, NOT pushed,
  NOT yet approved; see docs/ARCHITECTURE.md "Offline". Also local: nightly gate fix (GitHub starts
  scheduled runs ~6 h late, the old 04:xx-only gate skipped every night; now runs if past 04:00 and no brief today).
- Keys are in `.env.local` (Gemini, Groq, OpenRouter) and must also be GitHub secrets for the nightly run.
  `npm run pipeline:check-ai` shows which models work.
- Working models (checked 2026-11-03): gemini-3.5-flash-lite (often HTTP 503 "busy"), gemini-3.1-flash-lite,
  gemini-3.5-flash, Groq openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b.
- Full live run 2026-11-12: 434 written, 134 dropped, ~1.5M tokens, AI budget reached. Fact check then relaxed
  (nationalities, institution words, any spelling of a number). Repeated stories are merged after writing
  (`pipeline/src/run/dedupe.ts`): 17 merged → 297 stories. That brief is committed in `web/public/data`.
- Globe keeps fine (50m) shapes during flights when zoomed in; falls back to 110m for a flight if a frame takes
  over 22 ms; labels fade in over 250 ms. Owner confirmed smooth on the phone.
- Noted for M6: pins sometimes use a state centroid instead of the city (Nvidia → New York State, not NYC).
- Planned after M4: optional local model (Ollama, ~3–4B for the GTX 1650 4 GB) as last fallback, laptop runs only.

## Next steps

1. Owner approves M5, then push (also ships the nightly gate fix). Check the next nightly run on GitHub.
2. Then M6 (MapLibre map, geo fixes).
3. Owner's choice (2026-11-12): no hosting/install before M8. At M8, deliver an installable Android APK
   (free route, e.g. a Trusted Web Activity / Capacitor wrapper of the deployed app), not just "Add to Home screen".

## Handy commands

`npm run check` (format, lint, types, tests, secret scan) · `npm run dev:phone` (phone on same Wi-Fi:
http://192.168.178.47:3000) · `npm run pipeline:ingest` / `pipeline:mock` / `pipeline:live` / `pipeline:check-ai`.
