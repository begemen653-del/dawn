import { readFileSync } from "node:fs";
import type { GeoResult } from "./types";

/** [name, asciiName ("" = same), lon, lat, iso2, population, rank (0 = world city … 10)] */
export type GazetteerRow = readonly [string, string, number, number, string, number, number];

export interface City {
  readonly name: string;
  readonly at: readonly [number, number];
  readonly country: string;
  readonly population: number;
  readonly rank: number;
}

/** Lower case, accents removed, so "São Paulo", "Sao Paulo" and "SÃO PAULO" all match. */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[’']/g, "'").trim();
}

/**
 * City names that are also ordinary English words; found in a headline they are far more
 * likely to be the word ("Nice result", "Mobile phones") than the city.
 */
const COMMON_WORDS = new Set(
  [
    "nice",
    "mobile",
    "reading",
    "bath",
    "split",
    "victoria",
    "of",
    "university",
    "union",
    "independence",
    "liberty",
    "concord",
    "phoenix",
    "orange",
    "march",
    "may",
    "eagle",
    "hope",
    "deal",
    "battle",
    "most",
    "male",
    "aden",
    "bar",
    "best",
    "gap",
    "lead",
    "page",
    "sale",
    "tours",
    "valence",
    "wells",
  ].map(fold),
);

/**
 * Bundled list of ~7,300 populated places (Natural Earth, public domain), built by
 * `npm run geo`. Used to pin stories on the right city without any network lookups.
 */
export class Gazetteer {
  private readonly byName = new Map<string, City[]>();

  constructor(rows: readonly GazetteerRow[]) {
    for (const [name, ascii, lon, lat, country, population, rank] of rows) {
      const city: City = { name, at: [lon, lat], country, population, rank };
      for (const key of new Set([fold(name), ...(ascii ? [fold(ascii)] : [])])) {
        const list = this.byName.get(key);
        if (list) list.push(city);
        else this.byName.set(key, [city]);
      }
    }
    // Rows come biggest first, so each list is already ordered by population.
  }

  /** The biggest place with this name, preferring the given country. */
  find(name: string, country?: string): City | undefined {
    const list = this.byName.get(fold(name));
    if (!list) return undefined;
    return country ? list.find((c) => c.country === country) : list[0];
  }

  resolve(name: string, hint?: { readonly country?: string }): GeoResult | null {
    const city = this.find(name, hint?.country);
    return city ? { name: city.name, at: city.at, country: city.country, source: "gazetteer" } : null;
  }

  /**
   * Cities named in a piece of text (a headline). Only big or well-known places in the
   * given countries count, and only when written with a capital letter, to avoid false hits.
   */
  findInText(text: string, countries: readonly string[], minPopulation = 100_000): City[] {
    const found: City[] = [];
    const seen = new Set<string>();
    // Runs of capitalised words ("Rio de Janeiro" keeps its "de"); headlines are often Title Case,
    // so every 1-3 word span inside a run is tried, longest first ("New York City" before "New York").
    const runs = text.match(
      /\p{Lu}[\p{L}'’.-]*(?:\s+(?:(?:de|del|da|do|di|la|le|el|al|am|an|upon|on)\s+)?\p{Lu}[\p{L}'’.-]*)*/gu,
    );
    for (const run of runs ?? []) {
      const parts = run.split(/\s+/);
      let i = 0;
      while (i < parts.length) {
        let used = 1;
        for (let len = Math.min(4, parts.length - i); len >= 1; len--) {
          const key = fold(
            parts
              .slice(i, i + len)
              .join(" ")
              .replace(/['’]s$/, ""),
          );
          if (key.length < 4 || COMMON_WORDS.has(key)) continue;
          const city = this.byName
            .get(key)
            ?.find((c) => countries.includes(c.country) && (c.population >= minPopulation || c.rank <= 3));
          if (city) {
            if (!seen.has(city.name)) found.push(city);
            seen.add(city.name);
            used = len;
            break;
          }
        }
        i += used;
      }
    }
    return found;
  }
}

let shared: Gazetteer | null = null;

/** The bundled gazetteer (loaded once). */
export function gazetteer(): Gazetteer {
  shared ??= new Gazetteer(
    JSON.parse(readFileSync(new URL("../../data/gazetteer.json", import.meta.url), "utf8")) as GazetteerRow[],
  );
  return shared;
}
