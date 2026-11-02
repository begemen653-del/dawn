import { FEEDS } from "@dawn/config";
import { describe, expect, it } from "vitest";
import { batchStamps } from "../src/sources/gdelt";
import { countryFromDomain, fipsToIso2, gdeltDate, parseGkgLine, parseLocations } from "../src/sources/gkg";
import { parseRobots } from "../src/sources/robots";
import { itemToArticle, parseFeed } from "../src/sources/rss";
import { Article } from "../src/schema";

/** Builds a 27-column GKG line with the given fields filled in. */
function gkgLine(fields: Partial<Record<number, string>>): string {
  return Array.from({ length: 27 }, (_, i) => fields[i] ?? "").join("\t");
}

describe("robots.txt", () => {
  const robots = parseRobots(
    [
      "User-agent: *",
      "Disallow: /private/",
      "Disallow: /*/print$",
      "Disallow: /*?s=*",
      "Allow: /private/open",
      "",
      "User-agent: BadBot",
      "Disallow: /",
    ].join("\n"),
    "DawnBrief/0.1",
  );

  it("allows normal feed paths", () => {
    expect(robots.isAllowed("/world/rss")).toBe(true);
    expect(robots.isAllowed("/en/rss/default?cat=guncel")).toBe(true);
  });

  it("applies wildcards and end anchors correctly", () => {
    expect(robots.isAllowed("/news/print")).toBe(false);
    expect(robots.isAllowed("/news/printer")).toBe(true);
    expect(robots.isAllowed("/search?s=x")).toBe(false);
  });

  it("lets the longest matching rule win, Allow on ties", () => {
    expect(robots.isAllowed("/private/x")).toBe(false);
    expect(robots.isAllowed("/private/open")).toBe(true);
  });

  it("ignores groups for other bots and allows everything without rules", () => {
    expect(parseRobots("", "DawnBrief").isAllowed("/anything")).toBe(true);
    expect(parseRobots("User-agent: DawnBrief\nDisallow: /", "DawnBrief/0.1").isAllowed("/x")).toBe(false);
  });
});

describe("GDELT GKG parsing", () => {
  it("maps FIPS codes and web domains to countries", () => {
    expect(fipsToIso2("GM")).toBe("DE");
    expect(fipsToIso2("TU")).toBe("TR");
    expect(fipsToIso2("GZ")).toBe("PS");
    expect(countryFromDomain("hurriyet.com.tr")).toBe("TR");
    expect(countryFromDomain("bbc.co.uk")).toBe("GB");
    expect(countryFromDomain("example.com")).toBeUndefined();
    expect(countryFromDomain("startup.io")).toBeUndefined();
  });

  it("reads dates", () => {
    expect(gdeltDate("20261102224500")).toBe("2026-11-02T22:45:00Z");
    expect(gdeltDate("bad")).toBeNull();
  });

  it("parses locations, most-mentioned country first", () => {
    const { places, countries } = parseLocations(
      "4#Berlin, Berlin, Germany#GM#GM16#16#52.5167#13.4#-1746443#120;1#Germany#GM#GM##51#9#GM#80;1#Turkey#TU#TU##39#35#TU#300;4#Berlin, Berlin, Germany#GM#GM16#16#52.5167#13.4#-1746443#500",
    );
    expect(countries).toEqual(["DE", "TR"]);
    expect(places[0]).toEqual({
      name: "Berlin, Berlin, Germany",
      at: [13.4, 52.5167],
      country: "DE",
      kind: "city",
    });
    expect(places).toHaveLength(3);
  });

  it("turns a GKG line into a valid article", () => {
    const article = parseGkgLine(
      gkgLine({
        0: "20261102224500-7",
        1: "20261102224500",
        3: "www.example.de",
        4: "https://www.example.de/politik/koalition-einigt-sich?utm_source=rss",
        8: "ELECTION,10;ECON_INFLATION,40;ELECTION,90",
        10: "4#Berlin, Berlin, Germany#GM#GM16#16#52.5167#13.4#-1746443#120",
        12: "Friedrich Merz,100;Friedrich Merz,300",
        14: "Bundestag,50",
        25: "srclc:deu;eng:GT-DEU 1.0",
        26: "<PAGE_TITLE>Koalition einigt sich auf Haushalt &#8211; Example</PAGE_TITLE>",
      }),
    );
    expect(article).not.toBeNull();
    expect(Article.safeParse(article).success).toBe(true);
    expect(article).toMatchObject({
      url: "https://example.de/politik/koalition-einigt-sich",
      title: "Koalition einigt sich auf Haushalt",
      language: "de",
      sourceCountry: "DE",
      countries: ["DE"],
      themes: ["ELECTION", "ECON_INFLATION"],
      entities: ["friedrich merz", "bundestag"],
      curated: false,
    });
  });

  it("skips lines without a title or with a broken URL", () => {
    expect(parseGkgLine(gkgLine({ 1: "20261102224500", 4: "https://a.com/x" }))).toBeNull();
    expect(parseGkgLine("too\tfew\tcolumns")).toBeNull();
  });

  it("samples 15-minute batches newest first, skipping the not-yet-published slot", () => {
    const now = new Date("2026-11-02T10:07:00Z");
    expect(batchStamps(new Date("2026-11-02T08:00:00Z"), now, 60)).toEqual([
      "20261102094500",
      "20261102084500",
    ]);
    expect(batchStamps(new Date("2026-11-02T09:30:00Z"), now, 15)).toEqual([
      "20261102094500",
      "20261102093000",
    ]);
  });
});

describe("RSS / Atom parsing", () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
    <item><title>Parliament approves the new budget plan</title><link>https://www.example.com/a?utm_medium=rss</link><pubDate>Mon, 02 Nov 2026 07:00:00 GMT</pubDate></item>
    <item><title><![CDATA[Storm &amp; floods hit the coast overnight]]></title><link>https://example.com/b</link></item>
  </channel></rss>`;
  const rdf = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <item><title>DW item about the economy</title><link>https://www.dw.com/en/x/a-1</link><dc:date>2026-11-02T06:00:00Z</dc:date></item>
  </rdf:RDF>`;
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>Atom entry about science</title><link rel="alternate" href="https://example.org/c"/><updated>2026-11-02T05:00:00Z</updated></entry>
  </feed>`;

  it("parses RSS 2.0, RDF and Atom", () => {
    expect(parseFeed(rss)).toEqual([
      {
        title: "Parliament approves the new budget plan",
        link: "https://www.example.com/a?utm_medium=rss",
        published: "Mon, 02 Nov 2026 07:00:00 GMT",
      },
      { title: "Storm & floods hit the coast overnight", link: "https://example.com/b", published: null },
    ]);
    expect(parseFeed(rdf)[0]).toMatchObject({
      link: "https://www.dw.com/en/x/a-1",
      published: "2026-11-02T06:00:00Z",
    });
    expect(parseFeed(atom)[0]).toMatchObject({ link: "https://example.org/c" });
  });

  it("turns items into curated articles with the feed's country", () => {
    const feed = FEEDS.find((f) => f.id === "tagesschau");
    if (!feed) throw new Error("feed missing");
    const [item] = parseFeed(rss);
    if (!item) throw new Error("item missing");
    const article = itemToArticle(item, feed, new Date("2026-11-02T08:00:00Z"));
    expect(Article.safeParse(article).success).toBe(true);
    expect(article).toMatchObject({
      outlet: "Tagesschau",
      url: "https://example.com/a",
      curated: true,
      sourceCountry: "DE",
      countries: ["DE"],
      publishedAt: "2026-11-02T07:00:00.000Z",
    });
  });
});
