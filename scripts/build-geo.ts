/**
 * Prepares the globe's map data in web/public/geo/ (output is committed):
 *   countries-110m.json  whole-Earth view (world-atlas, Natural Earth 1:110m)
 *   countries-50m.json   zoomed-in view   (world-atlas, Natural Earth 1:50m)
 *   places.json          ~2,400 cities    (Natural Earth populated places, public domain)
 * Run with: npm run geo
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "web", "public", "geo");
const CACHE = join(ROOT, ".cache", "ne_10m_populated_places_simple.geojson");
const PLACES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson";

/** Natural Earth's importance scale: 0 = world city … 10 = small town. 6 keeps ~2,400 places. */
const MAX_SCALERANK = 6;

interface PlaceProperties {
  name: string;
  longitude: number;
  latitude: number;
  scalerank: number;
  featurecla: string;
  iso_a2: string;
  pop_max: number;
}

async function loadPlaces(): Promise<PlaceProperties[]> {
  if (!existsSync(CACHE)) {
    console.log(`Downloading ${PLACES_URL} ...`);
    const res = await fetch(PLACES_URL, { headers: { "User-Agent": "Dawn/0.1 (globe data build)" } });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    await mkdir(dirname(CACHE), { recursive: true });
    await writeFile(CACHE, await res.text(), "utf8");
  }
  const json = JSON.parse(await readFile(CACHE, "utf8")) as { features: { properties: PlaceProperties }[] };
  return json.features.map((f) => f.properties);
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const atlas = dirname(createRequire(import.meta.url).resolve("world-atlas/package.json"));
  for (const file of ["countries-110m.json", "countries-50m.json"]) {
    await copyFile(join(atlas, file), join(OUT, file));
    console.log(`Copied ${file}`);
  }

  const round = (n: number) => Math.round(n * 1000) / 1000;
  const places = (await loadPlaces())
    .filter((p) => p.scalerank <= MAX_SCALERANK && p.featurecla !== "Scientific station")
    .sort((a, b) => a.scalerank - b.scalerank || b.pop_max - a.pop_max)
    // [name, lon, lat, rank, isNationalCapital]
    .map((p) => [
      p.name,
      round(p.longitude),
      round(p.latitude),
      p.scalerank,
      p.featurecla.startsWith("Admin-0 capital") ? 1 : 0,
    ]);
  await writeFile(join(OUT, "places.json"), JSON.stringify(places), "utf8");
  console.log(`Wrote places.json with ${places.length} places`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
