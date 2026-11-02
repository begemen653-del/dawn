# Dawn — Image policy

> Status: policy fixed in Milestone 1. Per-source terms are verified and filled in during **Milestone 7**.
> Anything legally unclear will be raised with the owner instead of guessed.

## The rule

Credit lines and watermarks do **not** make copyrighted photos legal. Dawn **never** copies, hotlinks, scrapes or
re-hosts photos from news articles or agencies (AP, Reuters, Getty, AFP, outlets' `og:image`, …). The real news
photos stay on the original sites, reached through each story's **"Read the original"** links.

## Allowed sources (in order of preference)

1. **Wikimedia Commons** (API; license + attribution read from `extmetadata`) and **Openverse** (includes Flickr
   CC content).
2. **Public-domain / free-reuse institutional media:** NASA; Copernicus/Sentinel and NASA GIBS/Worldview
   satellite imagery; US government and Voice of America media (verified per item — third-party material inside
   them is excluded); European Parliament and European Commission media (reuse with credit; terms verified).
3. **AI-generated illustrations** from a free provider, always labelled "AI illustration".
4. **Map/satellite cards** as the last fallback.

## License allowlist (enforced in code)

Allowed: **public domain, CC0, CC BY, CC BY-SA** (`pipeline/src/schema/image.ts`, `ALLOWED_LICENSES`).

`verifyLicense()` in `pipeline/src/images/license.ts` returns an allowed license or `null` (= reject). It rejects:

- anything NC (non-commercial) or ND (no derivatives),
- missing, empty or unknown licenses ("custom license", "fair use", "all rights reserved", …),
- license URLs that are not on creativecommons.org,
- cases where the license **name and URL disagree**.

Tests: `pipeline/tests/license.test.ts`.

## Display rules

- Every image shows a caption: **author · license name (linked) · source link**. The credit is a caption in the
  UI and is **never drawn onto the image** (some licenses forbid modification).
- Archive photos are labelled **"Illustrative image, not from the event"** unless the metadata proves the image
  shows this exact event (`ImageAsset.illustrative`).
- Only the provider's recommended thumbnail URLs are hotlinked; metadata is cached; each API's rate limits and
  terms are respected.

## Other bundled assets

| Asset                        | Source                                  | License                                      |
| ---------------------------- | --------------------------------------- | -------------------------------------------- |
| Country data (names, shapes) | Natural Earth                           | Public domain                                |
| Flag font (Windows only)     | Twemoji via country-flag-emoji-polyfill | Graphics CC BY 4.0 (Twitter, Inc.); code MIT |
| App icons                    | Drawn for Dawn                          | Ours                                         |

## Per-source terms (Milestone 7)

| Source              | Terms link | Notes |
| ------------------- | ---------- | ----- |
| Wikimedia Commons   | TBD        |       |
| Openverse           | TBD        |       |
| NASA                | TBD        |       |
| Copernicus/Sentinel | TBD        |       |
| NASA GIBS           | TBD        |       |
| US Gov / VOA        | TBD        |       |
| EU Parliament       | TBD        |       |
| EU Commission       | TBD        |       |
| AI illustrations    | TBD        |       |
