import { describe, expect, it } from "vitest";
import { pitchFor } from "./MapGlobe";
import { flightMs, greatCircle, paddingFor, partOfLine, sceneShapes, unwrapGeometry } from "./scene-geo";
import type { WorldData } from "./world";

describe("map scene shapes", () => {
  it("keeps a Pacific route continuous across the date line", () => {
    const line = greatCircle([139.7, 35.7], [-122.4, 37.8]); // Tokyo → San Francisco
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs((line[i]?.[0] ?? 0) - (line[i - 1]?.[0] ?? 0))).toBeLessThan(10);
    }
    expect(line.at(-1)?.[0]).toBeCloseTo(-122.4 + 360, 1);
  });

  it("draws a route in from its start", () => {
    const line = greatCircle([0, 0], [10, 0], 10);
    expect(partOfLine(line, 0)).toHaveLength(2);
    expect(partOfLine(line, 0.5)).toHaveLength(6);
    expect(partOfLine(line, 1)).toHaveLength(11);
  });

  it("pads the map so the place sits at the focus point", () => {
    // Free space centred lower on a phone: the camera centre moves down by padding the top.
    expect(paddingFor(187.5, 500, 375, 812)).toEqual({ left: 0, right: 0, top: 188, bottom: 0 });
    expect(paddingFor(800, 400, 1200, 800)).toEqual({ left: 400, right: 0, top: 0, bottom: 0 });
  });

  it("takes longer to fly further", () => {
    expect(flightMs([0, 0], [1, 1])).toBeLessThan(flightMs([0, 0], [120, 10]));
    expect(flightMs([0, 0], [180, 0])).toBe(4000);
  });

  it("turns highlights, areas and routes into map shapes", () => {
    const germany = {
      id: "276",
      feature: {
        type: "Feature" as const,
        properties: {},
        geometry: { type: "Point" as const, coordinates: [10, 51] },
      },
      center: [10, 51] as [number, number],
      radius: 0.1,
    };
    const world: WorldData = { detail: "50m", shapes: [germany], byId: new Map([["276", germany]]) };
    const shapes = sceneShapes(
      {
        camera: { lng: 10, lat: 51, zoom: 5 },
        elements: [
          { type: "highlight", id: "c", country: "DE", tone: "focus" },
          { type: "area", id: "a", center: [10, 51], radiusKm: 100, tone: "alert" },
          { type: "arc", id: "r", from: [13.4, 52.5], to: [2.35, 48.86], kind: "flight", animated: true },
          { type: "marker", id: "m", at: [13.4, 52.5], label: "Berlin", emphasis: "primary" },
        ],
      },
      world,
    );
    expect(shapes.fills.features.map((f) => String(f.properties?.kind))).toEqual(["country", "area"]);
    expect(shapes.arcs.features).toHaveLength(1);
  });

  it("keeps country outlines continuous across the date line", () => {
    const chukotka = unwrapGeometry({
      type: "Polygon",
      coordinates: [
        [
          [179, 65],
          [180, 66],
          [-179, 66],
          [-178, 65],
          [179, 65],
        ],
      ],
    });
    const ring = chukotka.type === "Polygon" ? (chukotka.coordinates[0] ?? []) : [];
    expect(ring.map((p) => p[0])).toEqual([179, 180, 181, 182, 179]);
  });

  it("tilts the camera only when it comes close", () => {
    expect(pitchFor(1.5)).toBe(0);
    expect(pitchFor(5)).toBe(22);
    expect(pitchFor(9)).toBe(40);
  });
});
