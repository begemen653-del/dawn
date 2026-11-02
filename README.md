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

| What you want                                        | Command                                    |
| ---------------------------------------------------- | ------------------------------------------ |
| Install everything (first time, or after pulls)      | `npm install`                              |
| Start the app on your PC                             | `npm run dev` → open http://localhost:3000 |
| Make a fresh sample brief                            | `npm run pipeline:dry`                     |
| Run every quality check (format, lint, types, tests) | `npm run check`                            |
| Auto-format the code                                 | `npm run format`                           |
| Build the production site                            | `npm run build`                            |
| Rebuild the country list from Natural Earth          | `npm run countries`                        |

## Where things are

- `web/` — the app you see. `config/` — regions and the 232-country catalog. `pipeline/` — the nightly job.
- `docs/ARCHITECTURE.md` — how it all fits together. `docs/PIPELINE.md` — the nightly job.
  `docs/IMAGES.md` — the strict picture license policy.

## Secrets (API keys)

None are needed yet. From Milestone 4, free AI keys go **only** into GitHub → repo **Settings → Secrets and
variables → Actions** — never into files in this folder. Step-by-step instructions will be added here then.

## Coming later in this README

Deploying to Vercel, installing the app on Android and Windows, and the morning notification (Milestone 8).
