import { describe, expect, it } from "vitest";
import { fold, gazetteer, Gazetteer, type GazetteerRow } from "../src/geo/gazetteer";
import { placesFromHeadlines, snapRegionToCity } from "../src/geo/places";

const ROWS: GazetteerRow[] = [
  ["New York", "", -73.98, 40.75, "US", 19_000_000, 0],
  ["São Paulo", "Sao Paulo", -46.63, -23.56, "BR", 18_800_000, 0],
  ["Marseille", "", 5.37, 43.29, "FR", 1_400_000, 1],
  ["Nice", "", 7.25, 43.7, "FR", 900_000, 3],
  ["Rio de Janeiro", "", -43.23, -22.92, "BR", 11_700_000, 0],
  ["Paris", "", -95.55, 33.66, "US", 25_000, 8],
  ["Paris", "", 2.35, 48.86, "FR", 11_000_000, 0],
  ["Springfield", "", -89.65, 39.8, "US", 150_000, 6],
];

describe("gazetteer", () => {
  const gaz = new Gazetteer(ROWS);

  it("ignores accents and case", () => {
    expect(fold("SÃO Paulo")).toBe("sao paulo");
    expect(gaz.find("sao paulo")?.country).toBe("BR");
  });

  it("prefers the given country and the bigger place", () => {
    expect(gaz.find("Paris")?.country).toBe("US"); // first in the list as given
    expect(gaz.find("Paris", "FR")?.at).toEqual([2.35, 48.86]);
    expect(gaz.find("Paris", "DE")).toBeUndefined();
  });

  it("finds cities in Title Case headlines, only in the event's countries", () => {
    const hits = gaz.findInText("Deadly Fire In Marseille Apartment Block", ["FR"]);
    expect(hits.map((c) => c.name)).toEqual(["Marseille"]);
    expect(gaz.findInText("Deadly fire in Marseille", ["DE"])).toEqual([]);
  });

  it("keeps multi-word names whole and skips common words", () => {
    expect(gaz.findInText("Floods hit Rio de Janeiro", ["BR"]).map((c) => c.name)).toEqual([
      "Rio de Janeiro",
    ]);
    expect(gaz.findInText("Nice Weather Expected", ["FR"])).toEqual([]);
  });

  it("loads the bundled list", () => {
    const real = gazetteer();
    expect(real.find("Berlin", "DE")?.population).toBeGreaterThan(3_000_000);
    expect(real.find("New York", "US")?.at[0]).toBeCloseTo(-74, 0);
  });
});

describe("pins", () => {
  const gaz = new Gazetteer(ROWS);

  it("moves a state-level pin to the big city of the same name", () => {
    const snapped = snapRegionToCity(
      { name: "New York, United States", at: [-75.5, 42.9], country: "US", kind: "region" },
      gaz,
    );
    expect(snapped.kind).toBe("city");
    expect(snapped.at).toEqual([-73.98, 40.75]);
  });

  it("leaves real regions alone", () => {
    const region = {
      name: "Springfield, United States",
      at: [-89, 40] as [number, number],
      country: "US",
      kind: "region" as const,
    };
    expect(snapRegionToCity(region, gaz)).toBe(region);
  });

  it("counts cities across headlines, most-mentioned first", () => {
    const places = placesFromHeadlines(
      ["Strike in Paris", "Paris transport halted", "Protest spreads to Marseille"],
      ["FR"],
      gaz,
    );
    expect(places.map((p) => p.name)).toEqual(["Paris", "Marseille"]);
    expect(places[0]?.at).toEqual([2.35, 48.86]);
  });
});
