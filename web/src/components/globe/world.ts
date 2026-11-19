import { geoBounds, geoCentroid, geoDistance } from "d3-geo";
import type { Feature } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { withBase } from "../../lib/base-path";

export type Detail = "110m" | "50m";

export interface CountryShape {
  /** ISO 3166-1 numeric code ("276" = Germany), or "" for areas without one. */
  readonly id: string;
  readonly feature: Feature;
  /** Rough centre and angular radius (radians), used to skip shapes that are off-screen. */
  readonly center: [number, number];
  readonly radius: number;
}

export interface WorldData {
  readonly detail: Detail;
  readonly shapes: readonly CountryShape[];
  readonly byId: ReadonlyMap<string, CountryShape>;
}

/** [name, lon, lat, rank (0 = world city … 6), 1 if national capital] */
export type Place = readonly [name: string, lon: number, lat: number, rank: number, capital: 0 | 1];

type WorldTopology = Topology<{ countries: GeometryCollection }>;

const pending = new Map<Detail, Promise<WorldData>>();

function toShape(f: Feature): CountryShape {
  const center = geoCentroid(f);
  const [[w, s], [e, n]] = geoBounds(f);
  const corners: [number, number][] = [
    [w, s],
    [w, n],
    [e, s],
    [e, n],
  ];
  // Countries crossing the antimeridian get huge bounds; cap at a hemisphere (never skipped wrongly).
  const radius = Math.min(Math.PI / 2, Math.max(...corners.map((c) => geoDistance(center, c))));
  return { id: f.id === undefined ? "" : String(f.id), feature: f, center, radius };
}

/**
 * Loads a bundled Natural Earth world (via world-atlas, self-hosted) once per detail level.
 * 1:110m (~105 KB) for the whole Earth, 1:50m (~740 KB) only once someone zooms in.
 * A failed load is retried on the next call.
 */
export function loadWorld(detail: Detail): Promise<WorldData> {
  let promise = pending.get(detail);
  if (!promise) {
    promise = fetch(withBase(`/geo/countries-${detail}.json`))
      .then(async (res) => {
        if (!res.ok) throw new Error(`World map HTTP ${res.status}`);
        const topo = (await res.json()) as WorldTopology;
        const shapes = feature(topo, topo.objects.countries).features.map(toShape);
        return { detail, shapes, byId: new Map(shapes.filter((s) => s.id !== "").map((s) => [s.id, s])) };
      })
      .catch((error: unknown) => {
        pending.delete(detail);
        throw error;
      });
    pending.set(detail, promise);
  }
  return promise;
}

let placesPending: Promise<readonly Place[]> | null = null;

/** ~2,400 cities from Natural Earth, most important first. */
export function loadPlaces(): Promise<readonly Place[]> {
  placesPending ??= fetch(withBase("/geo/places.json"))
    .then(async (res) => {
      if (!res.ok) throw new Error(`Places HTTP ${res.status}`);
      return (await res.json()) as Place[];
    })
    .catch((error: unknown) => {
      placesPending = null;
      throw error;
    });
  return placesPending;
}
