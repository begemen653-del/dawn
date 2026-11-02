import { describe, expect, it } from "vitest";
import { SceneDirective } from "../src/schema";

const camera = { lng: 13.4, lat: 52.5, zoom: 5 };

describe("SceneDirective", () => {
  it("accepts every known element type", () => {
    const result = SceneDirective.safeParse({
      camera,
      elements: [
        { type: "marker", id: "a", at: [13.4, 52.5], label: "Berlin" },
        { type: "highlight", id: "b", country: "DE" },
        { type: "arc", id: "c", from: [13.4, 52.5], to: [2.35, 48.85], kind: "flight" },
        { type: "area", id: "d", center: [13.4, 52.5], radiusKm: 50 },
        { type: "timelineStep", id: "e", order: 1, label: "Start" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("fills defaults", () => {
    const scene = SceneDirective.parse({
      camera,
      elements: [{ type: "marker", id: "a", at: [0, 0], label: "X" }],
    });
    expect(scene.elements[0]).toMatchObject({ emphasis: "primary" });
  });

  it("rejects unknown element types", () => {
    const result = SceneDirective.safeParse({
      camera,
      elements: [{ type: "explosion", id: "a", at: [0, 0] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys", () => {
    const result = SceneDirective.safeParse({
      camera,
      elements: [{ type: "marker", id: "a", at: [0, 0], label: "X", color: "red" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates out of range", () => {
    const result = SceneDirective.safeParse({
      camera: { lng: 200, lat: 0, zoom: 3 },
      elements: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate element ids", () => {
    const result = SceneDirective.safeParse({
      camera,
      elements: [
        { type: "marker", id: "a", at: [0, 0], label: "X" },
        { type: "marker", id: "a", at: [1, 1], label: "Y" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many elements", () => {
    const elements = Array.from({ length: 13 }, (_, i) => ({
      type: "marker",
      id: `m${i}`,
      at: [0, 0],
      label: "X",
    }));
    expect(SceneDirective.safeParse({ camera, elements }).success).toBe(false);
  });
});
