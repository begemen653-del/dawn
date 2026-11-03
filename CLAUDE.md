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

## Status (2026-11-03)

- M1–M3 approved and pushed. M4 (AI layer) is built and committed locally, NOT pushed, NOT yet approved.
- Keys are in `.env.local` (Gemini, Groq, OpenRouter). `npm run pipeline:check-ai` shows which models work.
- Working models (checked 2026-11-03): gemini-3.5-flash-lite, gemini-3.1-flash-lite, Groq openai/gpt-oss-120b,
  qwen/qwen3.8-27b, openai/gpt-oss-20b. gemini-3.5-flash needs a big token allowance (it "thinks").
- Quick trial `DAWN_AI_MAX_EVENTS=40 npm run pipeline:live`: 28 stories written, 12 dropped, 27 published,
  ~150k tokens, 46 calls, ~7 min. Output saved in `pipeline/out/trial-brief/` (git-ignored); the repo still has the
  sample brief in `web/public/data`.

## Next steps (M4)

1. Before the full run: batches came out at only 1–2 events (deep events + article excerpts exceed
   `maxBatchTokens: 4_500` in `pipeline/src/ai/summarize.ts`), so ~1 call per event. A full run (~640 events)
   would need ~700 calls; check Gemini's daily request limit (AI Studio → rate limits) and consider larger
   batches for Gemini only (its per-minute token limit is high; Groq needs small ones).
2. Find out why 12 of 40 were dropped (log the drop reasons: grounding vs. "not news" vs. format).
3. Do the full ~30-minute run (`npm run pipeline:live`), then spot-check ~20 stories against their sources with
   the owner (acceptance test), and show the real brief in the app at phone size.
4. Then: owner adds the three keys as GitHub secrets (README "AI keys"), approve M4, push.

## Handy commands

`npm run check` (format, lint, types, tests, secret scan) · `npm run dev:phone` (phone on same Wi-Fi:
http://192.168.178.47:3000) · `npm run pipeline:ingest` / `pipeline:mock` / `pipeline:live` / `pipeline:check-ai`.
