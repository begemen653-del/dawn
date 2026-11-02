import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

export interface WorldData {
  readonly land: FeatureCollection;
  readonly borders: MultiLineString;
  /** Country shapes keyed by ISO 3166-1 numeric code ("276" = Germany). */
  readonly countries: ReadonlyMap<string, Feature>;
}

type WorldTopology = Topology<{ countries: GeometryCollection; land: GeometryCollection }>;

let pending: Promise<WorldData> | null = null;

/**
 * Loads the bundled Natural Earth 1:110m world (via world-atlas, self-hosted, ~105 KB) once.
 * A failed load is retried on the next call.
 */
export function loadWorld(): Promise<WorldData> {
  pending ??= fetch("/geo/countries-110m.json")
    .then(async (res) => {
      if (!res.ok) throw new Error(`World map HTTP ${res.status}`);
      const topo = (await res.json()) as WorldTopology;
      const countries = feature(topo, topo.objects.countries);
      const byId = new Map<string, Feature>();
      for (const f of countries.features) if (f.id !== undefined) byId.set(String(f.id), f);
      return {
        land: feature(topo, topo.objects.land),
        borders: mesh(topo, topo.objects.countries, (a, b) => a !== b),
        countries: byId,
      };
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
