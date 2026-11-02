/**
 * Generates config/countries.ts from Natural Earth admin-0 countries (public domain).
 * Run with: npm run countries
 *
 * The source file is downloaded once into .cache/ (git-ignored); the generated
 * catalog is committed, so the app and pipeline never fetch it at runtime.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CameraView, Country, SelectableRegionId, Tier } from "../config/types";
import { COUNTRY_LANGUAGES } from "./data/country-languages";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE_FILE = join(ROOT, ".cache", "ne_50m_admin_0_countries.geojson");
const OUT_FILE = join(ROOT, "config", "countries.ts");
const SOURCE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

/** Below this population a territory is left out, unless listed in ALWAYS_INCLUDE. */
const MIN_POPULATION = 1000;
const ALWAYS_INCLUDE = new Set(["VA"]);
const EXCLUDE = new Set(["AQ"]);

const TIER_1 = new Set([
  "US",
  "CA",
  "MX",
  "GB",
  "DE",
  "FR",
  "IT",
  "ES",
  "NL",
  "BE",
  "PL",
  "UA",
  "RU",
  "TR",
  "CH",
  "AT",
  "SE",
  "CN",
  "JP",
  "IN",
  "KR",
  "ID",
  "TW",
  "IL",
  "IR",
  "SA",
  "AE",
  "EG",
  "PK",
  "AU",
  "BR",
]);

/** Countries whose news region differs from the plain UN subregion mapping. */
const REGION_OVERRIDES: Readonly<
  Record<string, { region: SelectableRegionId; alsoIn?: SelectableRegionId[] }>
> = {
  TR: { region: "europe", alsoIn: ["middle-east", "asia"] },
  CY: { region: "europe", alsoIn: ["middle-east"] },
  RU: { region: "europe", alsoIn: ["asia"] },
  GE: { region: "asia", alsoIn: ["europe"] },
  AM: { region: "asia", alsoIn: ["europe"] },
  AZ: { region: "asia", alsoIn: ["europe"] },
  KZ: { region: "asia", alsoIn: ["europe"] },
  EG: { region: "middle-east", alsoIn: ["africa"] },
  IR: { region: "middle-east", alsoIn: ["asia"] },
  GL: { region: "north-america", alsoIn: ["europe"] },
  IO: { region: "asia" },
};

/** Everyday names where Natural Earth uses a formal one. */
const NAME_OVERRIDES: Readonly<Record<string, string>> = {
  CN: "China",
  US: "United States",
  CD: "DR Congo",
  FM: "Micronesia",
  BS: "Bahamas",
  GM: "Gambia",
  TR: "Türkiye (Turkey)",
};

const SUBREGION_TO_REGION: Readonly<Record<string, SelectableRegionId>> = {
  "Northern Europe": "europe",
  "Western Europe": "europe",
  "Southern Europe": "europe",
  "Eastern Europe": "europe",
  "Western Asia": "middle-east",
  "Eastern Asia": "asia",
  "South-Eastern Asia": "asia",
  "Southern Asia": "asia",
  "Central Asia": "asia",
  "Northern America": "north-america",
  "Central America": "north-america",
  Caribbean: "north-america",
  "South America": "south-america",
  "Northern Africa": "africa",
  "Western Africa": "africa",
  "Middle Africa": "africa",
  "Eastern Africa": "africa",
  "Southern Africa": "africa",
  "Australia and New Zealand": "oceania",
  Melanesia: "oceania",
  Micronesia: "oceania",
  Polynesia: "oceania",
};

type Position = [number, number];
type Ring = Position[];
type Geometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };

interface NeProperties {
  ISO_A2_EH: string;
  ISO_A3_EH: string;
  ADM0_A3: string;
  NAME_EN: string;
  SUBREGION: string;
  POP_EST: number;
  LABEL_X: number;
  LABEL_Y: number;
  WIKIDATAID: string | null;
}

interface NeFeature {
  properties: NeProperties;
  geometry: Geometry;
}

async function loadSource(): Promise<NeFeature[]> {
  if (!existsSync(CACHE_FILE)) {
    console.log(`Downloading Natural Earth data from ${SOURCE_URL} ...`);
    const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "Dawn/0.1 (country catalog build)" } });
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, await res.text(), "utf8");
  }
  const json = JSON.parse(await readFile(CACHE_FILE, "utf8")) as { features: NeFeature[] };
  return json.features;
}

function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a && b) sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum / 2);
}

/** Outer ring of the biggest polygon, so overseas islands don't blow up the view. */
function mainRing(geometry: Geometry): Ring {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let best: Ring = [];
  let bestArea = -1;
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer) continue;
    const area = ringArea(outer);
    if (area > bestArea) {
      best = outer;
      bestArea = area;
    }
  }
  return best;
}

function cameraFor(props: NeProperties, geometry: Geometry): CameraView {
  const ring = mainRing(geometry);
  const lons = ring.map((p) => p[0]);
  const lats = ring.map((p) => p[1]);
  const lat = props.LABEL_Y;
  const lonSpan = (Math.max(...lons) - Math.min(...lons)) * Math.cos((lat * Math.PI) / 180);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const span = Math.max(lonSpan, latSpan, 0.05);
  const zoom = Math.min(7.5, Math.max(1.8, Math.log2(280 / span)));
  return { lng: round(props.LABEL_X, 3), lat: round(lat, 3), zoom: round(zoom, 1) };
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function flagEmoji(iso2: string): string {
  return String.fromCodePoint(0x1f1e6 + iso2.charCodeAt(0) - 65, 0x1f1e6 + iso2.charCodeAt(1) - 65);
}

function toCountry(feature: NeFeature): Country {
  const p = feature.properties;
  const iso2 = p.ISO_A2_EH;
  const override = REGION_OVERRIDES[iso2];
  const region = override?.region ?? SUBREGION_TO_REGION[p.SUBREGION];
  if (!region) throw new Error(`No region mapping for ${iso2} (${p.SUBREGION})`);
  const languages = COUNTRY_LANGUAGES[iso2];
  if (!languages) throw new Error(`No languages listed for ${iso2} (${p.NAME_EN})`);
  const tier: Tier = TIER_1.has(iso2) ? 1 : 2;
  return {
    iso2,
    iso3: /^[A-Z]{3}$/.test(p.ISO_A3_EH) ? p.ISO_A3_EH : p.ADM0_A3,
    name: NAME_OVERRIDES[iso2] ?? p.NAME_EN,
    region,
    alsoIn: override?.alsoIn ?? [],
    flag: flagEmoji(iso2),
    camera: cameraFor(p, feature.geometry),
    languages,
    tier,
    wikidata: p.WIKIDATAID ?? null,
  };
}

async function main(): Promise<void> {
  const features = await loadSource();
  const byIso = new Map<string, NeFeature>();
  for (const f of features) {
    const { ISO_A2_EH: iso2, POP_EST: pop } = f.properties;
    if (!/^[A-Z]{2}$/.test(iso2) || EXCLUDE.has(iso2)) continue;
    if (pop < MIN_POPULATION && !ALWAYS_INCLUDE.has(iso2)) continue;
    const existing = byIso.get(iso2);
    // Natural Earth splits a few countries (e.g. Australia's external territories): keep the most populous part.
    if (!existing || pop > existing.properties.POP_EST) byIso.set(iso2, f);
  }
  const countries = [...byIso.values()].map(toCountry).sort((a, b) => a.name.localeCompare(b.name, "en"));

  const body = countries.map((c) => `  ${JSON.stringify(c)},`).join("\n");
  const file = `// GENERATED by scripts/build-countries.ts from Natural Earth (public domain). Do not edit by hand.
// To change regions, tiers or languages, edit the script or scripts/data/, then run: npm run countries
import type { Country, SelectableRegionId } from "./types";

export const COUNTRIES: readonly Country[] = [
${body}
];

const byIso2 = new Map<string, Country>(COUNTRIES.map((c) => [c.iso2, c]));

export function getCountry(iso2: string): Country | undefined {
  return byIso2.get(iso2.toUpperCase());
}

/** Countries whose primary region or secondary regions include the given region. */
export function countriesInRegion(region: SelectableRegionId): Country[] {
  return COUNTRIES.filter((c) => c.region === region || c.alsoIn.includes(region));
}
`;
  await writeFile(OUT_FILE, file, "utf8");
  console.log(`Wrote ${countries.length} countries to config/countries.ts`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
