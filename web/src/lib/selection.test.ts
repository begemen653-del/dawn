import { describe, expect, it } from "vitest";
import {
  chapterOrder,
  moveScope,
  normalizeSelection,
  scopeInfo,
  searchCountries,
  toggleScope,
} from "./selection";

describe("selection", () => {
  it("normalizes stored data", () => {
    expect(normalizeSelection(["europe", "DE", "global", "DE", "XX", "mars", 3, null])).toEqual([
      "europe",
      "DE",
    ]);
    expect(normalizeSelection("nope")).toEqual([]);
  });

  it("toggles scopes in and out, keeping order", () => {
    let s = toggleScope([], "europe");
    s = toggleScope(s, "DE");
    s = toggleScope(s, "TR");
    expect(s).toEqual(["europe", "DE", "TR"]);
    expect(toggleScope(s, "DE")).toEqual(["europe", "TR"]);
  });

  it("never lets Global be added or removed", () => {
    expect(toggleScope(["DE"], "global")).toEqual(["DE"]);
  });

  it("reorders", () => {
    expect(moveScope(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveScope(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveScope(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("always plays Global last", () => {
    expect(chapterOrder(["TR", "europe", "DE"])).toEqual(["TR", "europe", "DE", "global"]);
    expect(chapterOrder([])).toEqual(["global"]);
  });

  it("describes scopes", () => {
    expect(scopeInfo("DE")).toMatchObject({ kind: "country", title: "Germany", flag: "🇩🇪" });
    expect(scopeInfo("europe")).toMatchObject({ kind: "region", title: "Europe" });
  });
});

describe("searchCountries", () => {
  it.each([
    ["germ", "DE"],
    ["deutschland", "DE"],
    ["almanya", "DE"],
    ["turkey", "TR"],
    ["turkiye", "TR"],
    ["usa", "US"],
    ["uk", "GB"],
    ["holland", "NL"],
    ["jp", "JP"],
  ])("finds %s → %s first", (query, iso2) => {
    expect(searchCountries(query)[0]?.iso2).toBe(iso2);
  });

  it("returns nothing for an empty query", () => {
    expect(searchCountries("  ")).toEqual([]);
  });
});
