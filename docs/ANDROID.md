# Publishing and the Android app (Milestone 8)

## The website: GitHub Pages (free)

- Address: **https://begemen653-del.github.io/dawn/**
- `.github/workflows/pages.yml` builds the app with `DAWN_BASE_PATH=/dawn` and publishes `web/out`.
  It runs after every push to `main` and after every nightly brief (a push made by the nightly job
  itself cannot start other workflows, so Pages listens for "Nightly brief finished" instead).
- The repo is public, so Pages and Actions minutes are free. One-time setup: repo **Settings → Pages →
  Source: GitHub Actions**.
- Because the site lives in a folder (`/dawn`), every file path goes through `withBase()`
  (`web/src/lib/base-path.ts`); Next.js adds the folder to its own links and scripts. Pages are built as
  folders (`sources/index.html`, `trailingSlash`), because GitHub Pages would otherwise find the
  `sources` data folder before `sources.html`.
- Try the published build locally: build with `DAWN_BASE_PATH=/dawn`, then
  `npm run serve:pages --workspace @dawn/web` → http://localhost:4173/dawn/ (or the `dawn-pages`
  preview).

## The Android app

- `android-app/` is a [Capacitor](https://capacitorjs.com/) shell (`io.github.begemen653.dawn`) that
  opens the published site. New briefs and app changes arrive through the website, so the APK only
  needs rebuilding when the shell itself changes. Links to news sites open in the phone's browser.
- **Offline:** the site's service worker keeps the app and the last brief on the phone after the first
  start. If the very first start has no connection, a small "Dawn can't connect" page is shown.
- **Morning reminder:** `web/src/components/MorningReminder.tsx` schedules a daily notification at
  **06:30** (phone time) with the Local Notifications plugin. It is scheduled on the phone, needs no
  server or account, and is re-scheduled on every start. Android may deliver it a few minutes late to
  save battery. The nightly brief is normally ready by then, but GitHub sometimes starts the job hours
  late; on those days the app shows yesterday's brief (marked in the accent colour) until the new one
  arrives.
- **Icons and start screen** are drawn from the web logo by `node android-app/scripts/make-icons.mjs`.

### Building the APK

`.github/workflows/android.yml` builds a signed release APK on GitHub (no Android tools needed on the
PC) and attaches it as `Dawn.apk` to the release
**https://github.com/begemen653-del/dawn/releases/tag/android**. It runs when `android-app/` changes, or
by hand: **Actions → Android app → Run workflow**. Each build gets a higher version number, so it
installs over the previous one.

### The signing key (important)

Android only accepts an update if it is signed with the same key as the installed app.

- The key is `%USERPROFILE%\.dawn\dawn-release.jks` on the owner's PC (never in git; `*.jks` is
  ignored). Its password is `DAWN_KEYSTORE_PASSWORD` in `.env.local`.
- GitHub has copies as repository secrets `DAWN_KEYSTORE_BASE64` (the file, base64) and
  `DAWN_KEYSTORE_PASSWORD`. Key alias: `dawn`.
- **Back the key file and password up** (e.g. a USB stick or password manager). If both copies are lost, a
  new key works but the old app must be uninstalled first.

### Installing on the phone

1. On the phone, open the release page above and tap **Dawn.apk**.
2. Open the download. Android asks once to allow installing apps from the browser: allow it.
3. Tap **Install**, then **Open**. Allow notifications when asked (for the 06:30 reminder).

Updating later: same steps; the new version replaces the old one and keeps the saved brief.
