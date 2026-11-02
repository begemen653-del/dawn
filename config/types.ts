/** Ids of the selectable world regions. "global" is always on and always played last. */
export const REGION_IDS = [
  "global",
  "europe",
  "asia",
  "north-america",
  "south-america",
  "middle-east",
  "africa",
  "oceania",
] as const;

export type RegionId = (typeof REGION_IDS)[number];
export type SelectableRegionId = Exclude<RegionId, "global">;

/** Tier 1 gets full explainers and more stories; tier 2 gets shorter summaries. */
export type Tier = 1 | 2;

/** Where the globe camera rests when a chapter or country opens. */
export interface CameraView {
  readonly lng: number;
  readonly lat: number;
  readonly zoom: number;
}

export interface Region {
  readonly id: RegionId;
  readonly name: string;
  readonly tier: Tier;
  readonly camera: CameraView;
  /** Short line shown in the picker. */
  readonly blurb: string;
}

export interface Country {
  /** ISO 3166-1 alpha-2 (Kosovo uses the common user-assigned "XK"). */
  readonly iso2: string;
  /** ISO 3166-1 alpha-3, or the Natural Earth code where none exists. */
  readonly iso3: string;
  readonly name: string;
  /** Primary region used for grouping in the picker. */
  readonly region: SelectableRegionId;
  /** Other regions whose news this country also feeds into. */
  readonly alsoIn: readonly SelectableRegionId[];
  /** Emoji flag built from the ISO code. */
  readonly flag: string;
  readonly camera: CameraView;
  /** ISO 639-1 news languages, most important first. */
  readonly languages: readonly string[];
  readonly tier: Tier;
  /** Wikidata id, useful for image search later. */
  readonly wikidata: string | null;
  /** ISO 3166-1 numeric code (e.g. "276"); matches the ids in the bundled world map. */
  readonly isoNumeric: string | null;
  /** Other names people search for: "USA", "Deutschland", "Türkiye", ... */
  readonly aliases: readonly string[];
}
