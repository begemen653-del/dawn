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

## Status (2026-11-05)

- M1–M3 approved and pushed. M4 (AI layer) is built and committed locally, NOT pushed, NOT yet approved.
- Keys are in `.env.local` (Gemini, Groq, OpenRouter). `npm run pipeline:check-ai` shows which models work.
- Working models (checked 2026-11-03): gemini-3.5-flash-lite (often HTTP 503 "busy"), gemini-3.1-flash-lite,
  gemini-3.5-flash, Groq openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b.
- Done 2026-11-05: batches of up to 6 events / 14k tokens (`DEFAULT_SUMMARIZE`); providers declare
  `maxRequestTokens` and the chain skips models too small for a batch (Groq), events then retried alone; every
  drop is logged (`Dropped <id>: <reason>`) and grouped in status warnings; fact check no longer flags generic
  titles (Senate, Governor…), possessives, name variants, clock minutes; GDELT memory leak fixed (articles are
  `structuredClone`d) and pipeline scripts run with a 2 GB heap cap (peak ~1.5 GB, was >3.6 GB → crash).
- 40-event trial after the batching change: 29 written, 11 dropped (8 by the old fact check), 28 calls, ~9.5 min,
  ~132k tokens. That trial brief is in `web/public/data` (uncommitted); the committed version is the sample brief.
- Full run attempt 2026-11-05 stopped at batch 44/101: drive C: was full (owner freed space, ~15 GB free now).
  A full run is ~101 batches + retries; reading ~1,570 article pages takes ~6 min.

## Next steps (M4)

1. Owner chose to wait for the Gemini daily quota reset (~09:00 Berlin): run `npm run pipeline:live` in the
   morning (~45 min, run in background; check free disk space first).
2. Check the drop reasons in the log, then spot-check ~20 stories against their sources with the owner
   (acceptance test), and show the real brief in the app at phone size.
3. Then: owner adds the three keys as GitHub secrets (README "AI keys"), approve M4, push.

## Handy commands

`npm run check` (format, lint, types, tests, secret scan) · `npm run dev:phone` (phone on same Wi-Fi:
http://192.168.178.47:3000) · `npm run pipeline:ingest` / `pipeline:mock` / `pipeline:live` / `pipeline:check-ai`.
