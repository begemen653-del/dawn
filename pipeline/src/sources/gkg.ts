/**
 * Parser for GDELT Global Knowledge Graph 2.1 records (one tab-separated line per article).
 * Columns: https://data.gdeltproject.org/documentation/GDELT-Global_Knowledge_Graph_Codebook-V2.1.pdf
 */
import { getCountry, COUNTRIES } from "@dawn/config";
import type { Article, ArticlePlace } from "../schema";
import { canonicalUrl, cleanTitle, decodeEntities, domainOf, languageFromIso639 } from "../events/text";

const COL = {
  id: 0,
  date: 1,
  sourceName: 3,
  url: 4,
  v2Themes: 8,
  v2Locations: 10,
  v2Persons: 12,
  v2Organizations: 14,
  translationInfo: 25,
  extras: 26,
} as const;

/** GDELT uses FIPS 10-4 country codes; map them to ISO2 via the catalog. */
const FIPS_TO_ISO2 = new Map<string, string>(
  COUNTRIES.flatMap((c) => c.fips.map((f) => [f, c.iso2] as const)),
);

export function fipsToIso2(fips: string): string | undefined {
  return FIPS_TO_ISO2.get(fips);
}

/** Country of an outlet from its web domain (".de" → DE, ".com.tr" → TR, ".co.uk" → GB). */
export function countryFromDomain(domain: string): string | undefined {
  const tld = domain.split(".").at(-1)?.toUpperCase() ?? "";
  if (tld === "UK") return "GB";
  if (tld.length !== 2) return undefined;
  // Popular generic-looking ccTLDs used worldwide, so they say nothing about the country.
  if (["IO", "CO", "TV", "ME", "AI", "FM", "LY", "GG", "CC", "WS"].includes(tld)) return undefined;
  return getCountry(tld)?.iso2;
}

/** "20261102224500" → ISO date-time in UTC. */
export function gdeltDate(stamp: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

/** V2Locations: "type#name#FIPS#ADM1#ADM2#lat#lon#featureId#offset;..." */
export function parseLocations(field: string): { places: ArticlePlace[]; countries: string[] } {
  const counts = new Map<string, number>();
  const places: ArticlePlace[] = [];
  const seen = new Set<string>();
  for (const block of field.split(";")) {
    const parts = block.split("#");
    const type = Number(parts[0]);
    const name = parts[1] ?? "";
    const iso2 = fipsToIso2(parts[2] ?? "");
    const lat = Number(parts[5]);
    const lon = Number(parts[6]);
    if (!iso2 || name === "") continue;
    counts.set(iso2, (counts.get(iso2) ?? 0) + 1);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const key = `${name}|${type}`;
    if (seen.has(key) || places.length >= 10) continue;
    seen.add(key);
    // GDELT types: 1 country, 2 US state, 3 US city, 4 world city, 5 world state/region.
    const kind = type === 1 ? "country" : type === 3 || type === 4 ? "city" : "region";
    places.push({ name: name.slice(0, 120), at: [lon, lat], country: iso2, kind });
  }
  const countries = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c)
    .slice(0, 12);
  return { places, countries };
}

/** "NAME,offset;NAME,offset" → unique lowercase names, most frequent first. */
function parseNames(field: string, limit: number): string[] {
  const counts = new Map<string, number>();
  for (const block of field.split(";")) {
    const name = block.split(",")[0]?.trim().toLowerCase();
    if (name && name.length <= 80) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([n]) => n);
}

/** One GKG line → Article, or null when the line is unusable (no title, bad URL, ...). */
export function parseGkgLine(line: string): Article | null {
  const c = line.split("\t");
  if (c.length < 27) return null;
  const url = canonicalUrl(c[COL.url] ?? "");
  const publishedAt = gdeltDate(c[COL.date] ?? "");
  const rawTitle = /<PAGE_TITLE>([\s\S]*?)<\/PAGE_TITLE>/.exec(c[COL.extras] ?? "")?.[1];
  if (!url || !publishedAt || !rawTitle) return null;

  const domain = (c[COL.sourceName] ?? "").toLowerCase().replace(/^www\./, "") || domainOf(url);
  const title = cleanTitle(decodeEntities(rawTitle), domain).slice(0, 400);
  if (title.split(" ").length < 4) return null;

  const srclc = /srclc:([a-z]{2,3})/.exec(c[COL.translationInfo] ?? "")?.[1];
  const language = (srclc ? languageFromIso639(srclc) : "en") ?? "en";
  const { places, countries } = parseLocations(c[COL.v2Locations] ?? "");
  const themes = parseNames(c[COL.v2Themes] ?? "", 20).map((t) => t.toUpperCase());
  const entities = [
    ...parseNames(c[COL.v2Persons] ?? "", 10),
    ...parseNames(c[COL.v2Organizations] ?? "", 10),
  ];
  const sourceCountry = countryFromDomain(domain);

  return {
    id: `gdelt:${c[COL.id] ?? url}`,
    url,
    title,
    outlet: domain.slice(0, 80),
    domain: domain.slice(0, 120),
    language,
    publishedAt,
    sourceId: srclc ? "gdelt-translated" : "gdelt",
    countries,
    ...(sourceCountry ? { sourceCountry } : {}),
    places,
    themes,
    entities,
    curated: false,
  };
}
