import { getCountry } from "@dawn/config";
import type { SceneDirective } from "@dawn/pipeline/schema";
import { geoCircle, geoDistance, geoInterpolate } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, LineString } from "geojson";
import type { WorldData } from "./world";

type Tone = "focus" | "neutral" | "alert";

export interface SceneShapes {
  /** Highlighted countries and shaded areas (property "tone"). */
  readonly fills: FeatureCollection;
  /** Routes as great-circle lines (property "kind"). */
  readonly arcs: FeatureCollection<LineString>;
}

export const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const KM_PER_DEGREE = 111.195;

/**
 * Great-circle path between two points, with longitudes kept continuous so a route over the
 * Pacific doesn't jump across the whole map at the date line.
 */
export function greatCircle(from: readonly [number, number], to: readonly [number, number], steps = 64) {
  const at = geoInterpolate([from[0], from[1]], [to[0], to[1]]);
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const [lon, lat] = at(i / steps);
    const prev = points[i - 1];
    let x = lon;
    if (prev) while (x - prev[0] > 180) x -= 360;
    if (prev) while (prev[0] - x > 180) x += 360;
    points.push([x, lat]);
  }
  return points;
}

function unwrapRing(ring: readonly number[][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lon = 0, lat = 0] of ring) {
    const prev = out.at(-1);
    let x = lon;
    if (prev) while (x - prev[0] > 180) x -= 360;
    if (prev) while (prev[0] - x > 180) x += 360;
    out.push([x, lat]);
  }
  return out;
}

/**
 * Countries crossing the date line (Russia, Fiji, the USA's Aleutians) jump from +180° to −180°
 * inside one outline. A flat map hides that; on a globe the jump becomes a line right round the
 * Earth. Keeping longitudes continuous (181° instead of −179°) removes those rings.
 */
export function unwrapGeometry(geometry: Geometry): Geometry {
  if (geometry.type === "Polygon") return { ...geometry, coordinates: geometry.coordinates.map(unwrapRing) };
  if (geometry.type === "MultiPolygon")
    return { ...geometry, coordinates: geometry.coordinates.map((poly) => poly.map(unwrapRing)) };
  return geometry;
}

/** The first `share` (0..1) of a line, for drawing a route in. */
export function partOfLine(points: readonly [number, number][], share: number): [number, number][] {
  if (share >= 1) return [...points];
  const n = Math.max(2, Math.ceil(points.length * Math.max(0, share)));
  return points.slice(0, n);
}

/** Turns a scene directive into map shapes; countries come from the bundled Natural Earth borders. */
export function sceneShapes(scene: SceneDirective | null, world: WorldData | null): SceneShapes {
  const fills: Feature<Geometry, { tone: Tone; kind: string }>[] = [];
  const arcs: Feature<LineString, { kind: string }>[] = [];
  for (const el of scene?.elements ?? []) {
    if (el.type === "highlight") {
      const numeric = getCountry(el.country)?.isoNumeric;
      const shape = numeric ? world?.byId.get(numeric) : undefined;
      if (shape)
        fills.push({
          type: "Feature",
          geometry: unwrapGeometry(shape.feature.geometry),
          properties: { tone: el.tone, kind: "country" },
        });
    } else if (el.type === "area") {
      const circle = geoCircle()
        .center([el.center[0], el.center[1]])
        .radius(el.radiusKm / KM_PER_DEGREE)
        .precision(4)();
      fills.push({ type: "Feature", geometry: circle, properties: { tone: el.tone, kind: "area" } });
    } else if (el.type === "arc") {
      arcs.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: greatCircle(el.from, el.to) },
        properties: { kind: el.kind },
      });
    }
  }
  return {
    fills: { type: "FeatureCollection", features: fills },
    arcs: { type: "FeatureCollection", features: arcs },
  };
}

/** How long a flight takes: short hops are quick, half the world takes about 4 s. */
export function flightMs(from: readonly [number, number], to: readonly [number, number]): number {
  const distance = geoDistance([from[0], from[1]], [to[0], to[1]]);
  return Math.round(1600 + 2400 * Math.min(1, distance / Math.PI));
}

/**
 * Map padding that puts the camera's centre at the focus point (CSS px) instead of the middle
 * of the screen, so the story's place sits in the free space between the cards.
 */
export function paddingFor(x: number, y: number, width: number, height: number) {
  return {
    left: Math.max(0, 2 * x - width),
    right: Math.max(0, width - 2 * x),
    top: Math.max(0, 2 * y - height),
    bottom: Math.max(0, height - 2 * y),
  };
}
