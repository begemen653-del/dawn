# Dawn — Image policy

> Status: policy fixed in Milestone 1; Wikimedia Commons built and verified in **Milestone 7** (Nov 2026).
> Anything legally unclear is raised with the owner instead of guessed (see "Open questions").

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
| Globe shapes (1:110m, 1:50m) | Natural Earth via world-atlas           | Data public domain; package ISC              |
| City names and positions     | Natural Earth populated places          | Public domain                                |
| Flag font (Windows only)     | Twemoji via country-flag-emoji-polyfill | Graphics CC BY 4.0 (Twitter, Inc.); code MIT |
| App icons                    | Drawn for Dawn                          | Ours                                         |

## How photos are chosen (Milestone 7)

Code: `pipeline/src/images/commons.ts` (one Commons file → allowed or rejected), `pipeline/src/images/pick.ts`
(which photos go with which story), run after the AI step in `pipeline/src/run/brief.ts`. The owner's rule
(Nov 2026): **real event photos where a free official source has one, a fitting photo where the AI confirms it,
and no photo otherwise** (the globe already shows where the story happened).

1. **Event photos (real photos of the event):** the newest Commons uploads naming the headline's people
   ("Trump, Putin and Xi hold summit" → Trump Putin), taken within 3 days of the story, and **only from official
   photographers** who publish under free licenses: the Kremlin ("President of Russia", CC BY 4.0), the White
   House and other US government bodies (public domain), Ukraine's presidential office, EU institutions, NASA, …
   (`OFFICIAL` in `commons.ts`). Random uploads claiming a free license are never used as event photos.
2. **Place photos:** Commons **"Quality images"** geotagged within 12 km of the story's pin (searched by
   position, not by name), or around the middle of a small country. No people, no nature close-ups, no
   official event photos.
3. **AI check:** the candidates' descriptions go to the AI with the story; it keeps at most 2 photos a reader
   would clearly connect with the story, or none. Without the AI (quota used up), only an official recent photo
   whose description names the headline's people is kept.
4. **Labels:** a photo is shown as **"From the event"** only if the AI says it shows this event **and** it is an
   official photo taken within 3 days. Everything else is **"Illustrative"** ("Illustrative image, not from the
   event").
5. **Always rejected:** licenses outside the allowlist (`verifyLicense`), files flagged non-free, files with extra
   restrictions (personality, trademark, …), files without a named author unless public domain, small or upright
   pictures.
6. **Variety and fairness:** at most 2 photos per story; one photo on at most 3 stories.
7. **Polite use:** one request at a time, at least 1.2 s apart, 60 s pause after "too many requests", `maxlag=5`;
   place results cached 30 days, event searches 6 hours (`.cache/images`, kept between nightly runs); at most
   10 minutes per run.

In the app (`web/src/components/brief/Pictures.tsx`) each photo shows the whole picture (never cropped), its
label, and the author and license as a caption; tapping it opens the full credit: author, license name linked
to its terms, and a link to the file's Commons page. Photos already seen are kept offline for two weeks
(`web/src/sw/sw.ts`).

## Per-source terms

| Source              | Terms checked                                                                                                                              | Status                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Wikimedia Commons   | [Reusing content outside Wikimedia](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), each file's own license | **In use.** Reuse allowed under each file's license with attribution; hotlinking is allowed but "not recommended" |
| Wikimedia API       | [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy), API usage guidelines             | In use; the policy asks for contact details in the User-Agent (see open questions)                                |
| Openverse           | —                                                                                                                                          | Not used yet (anonymous limits are low; Commons covers places well)                                               |
| NASA                | —                                                                                                                                          | Not used yet                                                                                                      |
| Copernicus/Sentinel | —                                                                                                                                          | Not used yet                                                                                                      |
| NASA GIBS           | —                                                                                                                                          | Not used yet                                                                                                      |
| US Gov / VOA        | —                                                                                                                                          | Not used yet                                                                                                      |
| EU Parliament       | —                                                                                                                                          | Not used yet                                                                                                      |
| EU Commission       | —                                                                                                                                          | Not used yet                                                                                                      |
| AI illustrations    | —                                                                                                                                          | Not used: no free provider found whose terms clearly allow this use                                               |
| Elevation (globe)   | [Terrain Tiles attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) (AWS Open Data)                              | In use: relief shading and 3D terrain; credited behind the (i) button                                             |
| Map tiles (globe)   | [OpenFreeMap terms](https://openfreemap.org/tos/); © OpenMapTiles, © OpenStreetMap contributors                                            | In use (M6); credit behind the (i) button on the map                                                              |

## Open questions for the owner

- **Hotlinking:** Commons allows showing its thumbnails directly from its servers but calls it "not recommended"
  (they prefer copies). Dawn's rule says hotlink, never re-host; copying Commons photos would also be allowed by
  their licenses. Current choice: hotlink.
- **Contact in the User-Agent:** Wikimedia asks automated tools to include a contact (website or email) and may
  block tools without one. Dawn currently sends a generic name only.
