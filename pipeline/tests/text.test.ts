import { describe, expect, it } from "vitest";
import {
  canonicalUrl,
  cleanTitle,
  decodeEntities,
  languageFromIso639,
  titleTokens,
} from "../src/events/text";

describe("cleanTitle", () => {
  it("strips repeated site-name suffixes", () => {
    expect(
      cleanTitle(
        "Tarımsal Girdi Fiyat Endeksi, Temmuz 2026 – Haber Şefi – Haberler – Güncel Haberler – Haber Sitesi",
        "habersefi.com",
      ),
    ).toBe("Tarımsal Girdi Fiyat Endeksi, Temmuz 2026");
  });

  it("strips an outlet name after a separator", () => {
    expect(
      cleanTitle(
        "Colpo Fiorentina al Mapei Stadium, Sassuolo battuto 4-2 &#x2013; Padovanews",
        "padovanews.it",
      ),
    ).toBe("Colpo Fiorentina al Mapei Stadium, Sassuolo battuto 4-2");
  });

  it("keeps a real second clause", () => {
    const title = "Prices rise again - and economists warn that the central bank will act soon";
    expect(cleanTitle(title)).toBe(title);
  });

  it("removes tags and collapses spaces", () => {
    expect(cleanTitle("  <b>Big</b>   news   today  ")).toBe("Big news today");
  });
});

describe("decodeEntities", () => {
  it("decodes numeric and named entities", () => {
    expect(decodeEntities("A &amp; B &#8211; C &#x2014; D &quot;E&quot;")).toBe('A & B – C — D "E"');
  });
});

describe("canonicalUrl", () => {
  it("removes tracking, fragments, www and trailing slashes", () => {
    expect(canonicalUrl("http://www.Example.com/a/b/?utm_source=x&id=3#top")).toBe(
      "https://example.com/a/b?id=3",
    );
  });

  it("rejects non-web links", () => {
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalUrl("not a url")).toBeNull();
  });
});

describe("titleTokens", () => {
  it("drops stop words in several languages and folds accents and plurals", () => {
    expect(titleTokens("The elections in Türkiye: what the voters say")).toEqual([
      "election",
      "turkiye",
      "voter",
    ]);
    expect(titleTokens("Die Regierung und der Kanzler")).toEqual(["regierung", "kanzler"]);
  });
});

describe("languageFromIso639", () => {
  it("maps GDELT three-letter codes", () => {
    expect(languageFromIso639("deu")).toBe("de");
    expect(languageFromIso639("tur")).toBe("tr");
    expect(languageFromIso639("en")).toBe("en");
    expect(languageFromIso639("xyz")).toBeNull();
  });
});
