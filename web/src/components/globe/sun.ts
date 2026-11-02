/**
 * Where the sun is overhead right now (the "subsolar point"), accurate to about 0.1°.
 * Uses the low-precision solar formulas from the US Naval Observatory almanac.
 */
export function subsolarPoint(date: Date): [lon: number, lat: number] {
  const rad = Math.PI / 180;
  const d = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad; // mean anomaly
  const q = 280.459 + 0.98564736 * d; // mean longitude
  const lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; // ecliptic longitude
  const epsilon = (23.439 - 0.00000036 * d) * rad; // obliquity
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / rad;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / rad;
  const gmstHours = 18.697374558 + 24.06570982441908 * d;
  const lon = normalizeLon(rightAscension - gmstHours * 15);
  return [lon, declination];
}

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * The sunrise line: points 90° from the subsolar point on its western side,
 * where the morning is arriving right now.
 */
export function dawnLine(sun: readonly [number, number], steps = 64): [number, number][] {
  const rad = Math.PI / 180;
  const [lon0, lat0] = [sun[0] * rad, sun[1] * rad];
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    // Bearings 180°→360° sweep south → west → north.
    const bearing = (180 + (180 * i) / steps) * rad;
    const delta = Math.PI / 2;
    const lat = Math.asin(
      Math.sin(lat0) * Math.cos(delta) + Math.cos(lat0) * Math.sin(delta) * Math.cos(bearing),
    );
    const lon =
      lon0 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(delta) * Math.cos(lat0),
        Math.cos(delta) - Math.sin(lat0) * Math.sin(lat),
      );
    points.push([normalizeLon(lon / rad), lat / rad]);
  }
  return points;
}
