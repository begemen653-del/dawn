export interface GeoResult {
  readonly name: string;
  /** [longitude, latitude] */
  readonly at: readonly [number, number];
  readonly country?: string;
  readonly source: "gazetteer" | "nominatim";
}

/** Resolves AI-extracted place names to coordinates. Built in Milestone 6. */
export interface Geocoder {
  resolve(place: string, hint?: { readonly country?: string }): Promise<GeoResult | null>;
}
