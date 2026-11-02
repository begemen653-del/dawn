import { describe, expect, it } from "vitest";
import { cameraAt, easeInOutCubic, planFlight, zoomToScale } from "./camera";

describe("globe camera", () => {
  it("eases from 0 to 1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });

  it("maps zoom levels into a sensible scale range", () => {
    expect(zoomToScale(1)).toBeGreaterThanOrEqual(0.85);
    expect(zoomToScale(5.5)).toBeGreaterThan(zoomToScale(3));
    expect(zoomToScale(20)).toBe(9);
  });

  it("starts and ends exactly at the endpoints", () => {
    const flight = planFlight({ lon: 13.4, lat: 52.5, k: 5 }, { lon: 139.7, lat: 35.7, k: 6 });
    expect(cameraAt(flight, 0)).toMatchObject({ k: 5 });
    const end = cameraAt(flight, 1);
    expect(end.lon).toBeCloseTo(139.7);
    expect(end.lat).toBeCloseTo(35.7);
    expect(end.k).toBeCloseTo(6);
  });

  it("pulls back further on long flights than on short ones", () => {
    const near = planFlight({ lon: 13.4, lat: 52.5, k: 5 }, { lon: 28.9, lat: 41, k: 5 });
    const far = planFlight({ lon: 13.4, lat: 52.5, k: 5 }, { lon: -77, lat: 38.9, k: 5 });
    expect(cameraAt(far, 0.5).k).toBeLessThan(cameraAt(near, 0.5).k);
    expect(far.durationMs).toBeGreaterThan(near.durationMs);
  });
});
