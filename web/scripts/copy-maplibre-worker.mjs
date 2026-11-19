// MapLibre draws the map with the help of a background worker script. Bundlers can't find it on
// their own, so it is copied into public/ (served as /maplibre/maplibre-gl-worker.mjs, git-ignored).
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json"));
const out = join(web, "public", "maplibre");
await mkdir(out, { recursive: true });
await copyFile(join(dist, "dist", "maplibre-gl-worker.mjs"), join(out, "maplibre-gl-worker.mjs"));
