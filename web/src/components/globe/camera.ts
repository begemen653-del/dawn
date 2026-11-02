import { geoDistance, geoInterpolate } from "d3-geo";

/** Where the globe looks: center and orthographic scale factor (1 = whole Earth fits). */
export interface GlobeCamera {
  readonly lon: number;
  readonly lat: number;
  readonly k: number;
}

export interface Flight {
  readonly from: GlobeCamera;
  readonly to: GlobeCamera;
  /** Great-circle distance in radians (0..π). */
  readonly distance: number;
  readonly durationMs: number;
}

const MIN_K = 0.85;
const MAX_K = 9;

/**
 * Converts a map zoom level (the scale MapLibre and the scene directive use) into the
 * orthographic scale of the canvas globe. Kept gentler than web-map zoom so a whole
 * country stays in view on a phone.
 */
export function zoomToScale(zoom: number): number {
  return Math.min(MAX_K, Math.max(MIN_K, 2 ** ((zoom - 1.2) * 0.62)));
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function planFlight(from: GlobeCamera, to: GlobeCamera): Flight {
  const distance = geoDistance([from.lon, from.lat], [to.lon, to.lat]);
  // Short hops are quick; flying halfway round the world takes about 3.2 s.
  const durationMs = 1400 + 1800 * Math.min(1, distance / Math.PI);
  return { from, to, distance, durationMs };
}

/**
 * Camera at progress t (0..1): eased great-circle path plus a zoom-out "arc" in the middle
 * that grows with distance, so far jumps pull back to show the journey.
 */
export function cameraAt(flight: Flight, t: number): GlobeCamera {
  const clamped = Math.min(1, Math.max(0, t));
  const e = easeInOutCubic(clamped);
  const [lon, lat] = geoInterpolate([flight.from.lon, flight.from.lat], [flight.to.lon, flight.to.lat])(e);
  const baseK = flight.from.k + (flight.to.k - flight.from.k) * e;
  const pullBack = Math.min(0.75, (flight.distance / Math.PI) * 1.4 + 0.15);
  const arc = 1 - pullBack * Math.sin(Math.PI * clamped);
  return { lon, lat, k: Math.max(MIN_K * 0.7, baseK * arc) };
}
