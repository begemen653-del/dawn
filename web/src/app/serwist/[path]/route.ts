import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// Versions the precached pages; falls back to a random id outside git.
const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();
const revision = gitHead === "" ? randomUUID() : gitHead;
// "/dawn" on GitHub Pages (see next.config.ts).
const basePath = process.env.DAWN_BASE_PATH ?? "";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  // The app itself (pages, code, map shapes, fonts) is saved on install so it opens offline.
  // The daily brief is NOT part of it: the app saves that itself (src/lib/brief.ts), so a new
  // brief never means re-installing the app and an app update never throws away the brief.
  additionalPrecacheEntries: [
    { url: `${basePath}/`, revision },
    { url: `${basePath}/~offline/`, revision },
    { url: `${basePath}/sources/`, revision },
  ],
  // Serwist's default list plus the reading fonts (.woff2), so text looks the same offline.
  globPatterns: [".next/static/**/*.{js,css,html,ico,png,svg,webp,json,webmanifest,woff2}", "public/**/*"],
  globIgnores: ["public/data/**"],
  swSrc: "src/sw/sw.ts",
  useNativeEsbuild: true,
});
