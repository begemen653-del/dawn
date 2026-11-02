import { describe, expect, it } from "vitest";
import { COUNTRIES, countriesInRegion, getCountry, REGION_IDS, REGIONS } from "../index";

describe("country catalog", () => {
  it("covers the vast majority of countries", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(190);
  });

  it("has unique ISO codes", () => {
    expect(new Set(COUNTRIES.map((c) => c.iso2)).size).toBe(COUNTRIES.length);
    expect(new Set(COUNTRIES.map((c) => c.iso3)).size).toBe(COUNTRIES.length);
  });

  it("has valid fields for every country", () => {
    for (const c of COUNTRIES) {
      expect(c.iso2, c.name).toMatch(/^[A-Z]{2}$/);
      expect(c.iso3, c.name).toMatch(/^[A-Z]{3}$/);
      expect(REGION_IDS, c.name).toContain(c.region);
      expect(c.region, c.name).not.toBe("global");
      expect(c.languages.length, c.name).toBeGreaterThan(0);
      expect(Math.abs(c.camera.lng), c.name).toBeLessThanOrEqual(180);
      expect(Math.abs(c.camera.lat), c.name).toBeLessThanOrEqual(90);
      expect(c.camera.zoom, c.name).toBeGreaterThanOrEqual(1.8);
      expect(c.camera.zoom, c.name).toBeLessThanOrEqual(7.5);
    }
  });

  it("puts key countries in the expected regions", () => {
    expect(getCountry("DE")?.region).toBe("europe");
    expect(getCountry("tr")?.region).toBe("europe");
    expect(getCountry("TR")?.alsoIn).toContain("middle-east");
    expect(getCountry("US")?.region).toBe("north-america");
    expect(getCountry("JP")?.region).toBe("asia");
    expect(getCountry("BR")?.region).toBe("south-america");
    expect(getCountry("SA")?.region).toBe("middle-east");
    expect(getCountry("NG")?.region).toBe("africa");
    expect(getCountry("NZ")?.region).toBe("oceania");
  });

  it("gives every selectable region countries", () => {
    for (const region of REGIONS) {
      if (region.id === "global") continue;
      expect(countriesInRegion(region.id).length, region.id).toBeGreaterThan(5);
    }
  });

  it("builds emoji flags from the ISO code", () => {
    expect(getCountry("DE")?.flag).toBe("🇩🇪");
  });
});
