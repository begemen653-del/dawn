import { COUNTRIES, FEEDS, getCountry, REGIONS, type RegionId } from "@dawn/config";
import type { EventCluster } from "./types";

export interface ChapterPlan {
  /** Region id or country ISO2. */
  readonly scope: string;
  readonly title: string;
  readonly eventIds: readonly string[];
  readonly emptyReason?: string;
}

export interface AssignOptions {
  /** Share of an event's articles that must mention a country for it to count as "about" it. */
  readonly minCountryWeight: number;
  /** Events need at least this many different outlets (the app shows 2+ sources per story). */
  readonly minOutlets: number;
  readonly maxTier1: number;
  readonly maxTier2: number;
  readonly maxRegion: number;
  readonly maxGlobal: number;
}

export const DEFAULT_ASSIGN_OPTIONS: AssignOptions = {
  minCountryWeight: 0.5,
  minOutlets: 2,
  maxTier1: 8,
  maxTier2: 5,
  maxRegion: 8,
  maxGlobal: 8,
};

const FEED_SCOPES = new Map(FEEDS.map((f) => [`rss:${f.id}`, f.scopes]));

/** Countries clearly at the heart of the event (no weak fallback: unclear events stay unplaced). */
function aboutCountries(e: EventCluster, minWeight: number): string[] {
  return e.countries.filter((c) => c.weight >= minWeight).map((c) => c.iso2);
}

/**
 * Regions an event belongs to: the home regions of the countries it is about. Secondary regions
 * (Russia also being in Asia) only count for the picker, not here. Curated regional feeds decide
 * only when the event names no clear country.
 */
function eventRegions(e: EventCluster, countries: readonly string[]): Set<RegionId> {
  const regions = new Set<RegionId>();
  for (const iso2 of countries) {
    const c = getCountry(iso2);
    if (c) regions.add(c.region);
  }
  // Weakly placed events (some countries, none clearly) are not given a region from feeds.
  if (regions.size > 0 || e.countries.length > 0) return regions;
  for (const a of e.articles) {
    for (const s of FEED_SCOPES.get(a.sourceId) ?? []) {
      if (REGIONS.some((r) => r.id === s)) regions.add(s as RegionId);
    }
  }
  return regions;
}

/** Takes events in score order, allowing at most `perKey` events with the same key. */
function pickDiverse(
  events: readonly EventCluster[],
  limit: number,
  key: (e: EventCluster) => string,
  perKey: number,
): string[] {
  const counts = new Map<string, number>();
  const picked: string[] = [];
  for (const e of events) {
    if (picked.length >= limit) break;
    const k = key(e);
    const n = counts.get(k) ?? 0;
    if (n >= perKey) continue;
    counts.set(k, n + 1);
    picked.push(e.id);
  }
  return picked;
}

/**
 * Builds a chapter for every region and country (plus Global) from scored events.
 * Each event is summarized once later and simply referenced by every chapter it belongs to.
 */
export function buildChapters(
  scored: readonly EventCluster[],
  options: AssignOptions = DEFAULT_ASSIGN_OPTIONS,
): ChapterPlan[] {
  const eligible = scored.filter((e) => e.outlets.length >= options.minOutlets);
  const info = eligible.map((e) => {
    const countries = aboutCountries(e, options.minCountryWeight);
    return { e, countries, regions: eventRegions(e, countries), primary: countries[0] ?? "?" };
  });
  const primary = new Map(info.map((x) => [x.e, x.primary]));
  const primaryOf = (e: EventCluster) => primary.get(e) ?? "?";
  const chapters: ChapterPlan[] = [];

  // Global: widely covered stories, at most two about the same country.
  const global = info.filter(({ e }) => {
    const sourceCountries = new Set(e.articles.map((a) => a.sourceCountry).filter(Boolean)).size;
    const globalFeed = e.articles.some((a) => (FEED_SCOPES.get(a.sourceId) ?? []).includes("global"));
    // Independent coverage across languages or countries, or picked up by the hand-picked global outlets.
    return (
      e.voices >= 3 &&
      (e.languages.length >= 3 ||
        sourceCountries >= 4 ||
        (globalFeed && e.curatedOutlets >= 1) ||
        e.curatedOutlets >= 2)
    );
  });
  chapters.push(
    withReason(
      "global",
      "Global",
      pickDiverse(
        global.map((x) => x.e),
        options.maxGlobal,
        primaryOf,
        2,
      ),
    ),
  );

  for (const region of REGIONS) {
    if (region.id === "global") continue;
    const inRegion = info.filter((x) => x.regions.has(region.id)).map((x) => x.e);
    chapters.push(withReason(region.id, region.name, pickDiverse(inRegion, options.maxRegion, primaryOf, 2)));
  }

  for (const country of COUNTRIES) {
    const about = info.filter((x) => x.countries.includes(country.iso2)).map((x) => x.e.id);
    const limit = country.tier === 1 ? options.maxTier1 : options.maxTier2;
    chapters.push(withReason(country.iso2, country.name, about.slice(0, limit)));
  }
  return chapters;
}

function withReason(scope: string, title: string, eventIds: string[]): ChapterPlan {
  return eventIds.length > 0
    ? { scope, title, eventIds }
    : { scope, title, eventIds, emptyReason: `Almost no news about ${title} in the last 24 hours.` };
}
