import type { ArticlePlace } from "../schema";
import type { Gazetteer } from "./gazetteer";

/** A state or province this big shares its name with its main city (New York, Berlin, Istanbul). */
const SNAP_MIN_POPULATION = 500_000;

/**
 * GDELT often files a city under the state or province of the same name ("New York" the state),
 * which puts the pin on the state's middle instead of the city. When a big city has exactly
 * that name in the same country, use the city.
 */
export function snapRegionToCity(place: ArticlePlace, gaz: Gazetteer): ArticlePlace {
  if (place.kind !== "region" || !place.country) return place;
  const first = place.name.split(",")[0]?.trim() ?? "";
  const city = gaz.find(first, place.country);
  if (!city || city.population < SNAP_MIN_POPULATION) return place;
  return { ...place, at: [city.at[0], city.at[1]], kind: "city" };
}

/**
 * Cities named in the event's headlines, for events whose articles came without places
 * (RSS feeds). Only big places in the event's own countries count.
 */
export function placesFromHeadlines(
  titles: readonly string[],
  countries: readonly string[],
  gaz: Gazetteer,
): ArticlePlace[] {
  const counts = new Map<string, { place: ArticlePlace; count: number }>();
  for (const title of titles) {
    for (const city of gaz.findInText(title, countries)) {
      const entry = counts.get(city.name);
      if (entry) entry.count++;
      else
        counts.set(city.name, {
          place: { name: city.name, at: [city.at[0], city.at[1]], country: city.country, kind: "city" },
          count: 1,
        });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).map((x) => x.place);
}
