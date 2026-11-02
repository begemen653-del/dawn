import { geoDistance } from "d3-geo";
import { describe, expect, it } from "vitest";
import { dawnLine, normalizeLon, subsolarPoint } from "./sun";

describe("subsolarPoint", () => {
  it("is over the Tropic of Cancer at the June solstice, near Greenwich at noon UTC", () => {
    const [lon, lat] = subsolarPoint(new Date("2026-06-21T12:00:00Z"));
    expect(lat).toBeCloseTo(23.44, 0);
    expect(Math.abs(lon)).toBeLessThan(2);
  });

  it("is near the equator at the March equinox", () => {
    const [, lat] = subsolarPoint(new Date("2026-03-20T14:46:00Z"));
    expect(Math.abs(lat)).toBeLessThan(0.3);
  });

  it("moves west about 15° per hour", () => {
    const [a] = subsolarPoint(new Date("2026-11-02T06:00:00Z"));
    const [b] = subsolarPoint(new Date("2026-11-02T07:00:00Z"));
    expect(normalizeLon(a - b)).toBeCloseTo(15, 0);
  });
});

describe("dawnLine", () => {
  it("lies 90° from the sun, on its western side", () => {
    const sun: [number, number] = [30, 10];
    const line = dawnLine(sun, 16);
    for (const p of line) expect(geoDistance(p, sun)).toBeCloseTo(Math.PI / 2, 5);
    const middle = line[8];
    expect(middle?.[0]).toBeCloseTo(-60, 0);
  });
});
