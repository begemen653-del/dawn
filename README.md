# Dawn — your morning world brief

Open it after waking up and understand what is happening in the world in 2–3 minutes: a 3D globe flies to each
story, a card explains it in plain words, and you can go deeper.

Everything runs on free services. No accounts, no tracking.

> **Status:** Milestone 1 (foundation). The app shows **sample data**; real news arrives in Milestones 3–4.

## What you need (once)

- **Node.js 24** — https://nodejs.org (LTS installer). Check with `node -v`.
- **Git** and the **GitHub CLI** (`gh`) — already installed on this PC.

## Everyday commands

Open a terminal in the project folder (`C:\dev\Dawn`) and run:

| What you want                                        | Command                                                   |
| ---------------------------------------------------- | --------------------------------------------------------- |
| Install everything (first time, or after pulls)      | `npm install`                                             |
| Start the app on your PC                             | `npm run dev` → open http://localhost:3000                |
| Start it so your phone (same Wi-Fi) can open it      | `npm run dev:phone` → open http://YOUR-PC-IP:3000         |
| Make a fresh sample brief                            | `npm run pipeline:dry`                                    |
| Fetch real news and see the top stories              | `npm run pipeline:ingest` → open `pipeline/out/report.md` |
| Run every quality check (format, lint, types, tests) | `npm run check`                                           |
| Auto-format the code                                 | `npm run format`                                          |
| Build the production site                            | `npm run build`                                           |
| Rebuild the country list from Natural Earth          | `npm run countries`                                       |

## Where things are

- `web/` — the app you see. `config/` — regions and the 232-country catalog. `pipeline/` — the nightly job.
- `docs/ARCHITECTURE.md` — how it all fits together. `docs/PIPELINE.md` — the nightly job.
  `docs/IMAGES.md` — the strict picture license policy.

## AI keys (free, no credit card)

Dawn's summaries are written by free AI services. You need at least one key; two gives a backup.

**1. Create the keys**

| Service                            | Where                               | Steps                                           |
| ---------------------------------- | ----------------------------------- | ----------------------------------------------- |
| Google Gemini (main)               | https://aistudio.google.com/apikey  | Sign in with Google → **Create API key** → copy |
| Groq (backup)                      | https://console.groq.com/keys       | Sign up with email → **Create API Key** → copy  |
| OpenRouter (optional, last resort) | https://openrouter.ai/settings/keys | Sign up → **Create Key** → copy                 |

Never paste keys into chat, issues or code files.

**2. Put them on GitHub (for the nightly run)**

github.com → your `dawn` repo → **Settings** → **Secrets and variables** → **Actions** → **New repository
secret**. Create one secret per key, named exactly `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`.

**3. Put them on your PC (to run it yourself)**

In `C:\dev\Dawn`, copy `.env.example` to a new file named `.env.local`, open it in Notepad and paste each key
after its `=`. This file is ignored by git, so it never leaves your PC. Then:

| What you want                                | Command                 |
| -------------------------------------------- | ----------------------- |
| Build today's real brief (news + AI)         | `npm run pipeline:live` |
| Test the whole flow with a fake AI (no keys) | `npm run pipeline:mock` |

**Run it on GitHub now:** repo → **Actions** → **Nightly brief** → **Run workflow** → mode `live`.

## Using Dawn

- **Website:** https://begemen653-del.github.io/dawn/ (updated after every nightly brief).
- **Android app:** download `Dawn.apk` from https://github.com/begemen653-del/dawn/releases/tag/android and
  install it; it reminds you at 06:30 each morning. Details and the signing key: [docs/ANDROID.md](docs/ANDROID.md).
- **Sources & credits:** the “Sources” link at the bottom right of the app.
