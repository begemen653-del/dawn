import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildChapters } from "../src/events/assign";
import { clusterArticles, dedupe, siteBoilerplate } from "../src/events/cluster";
import { isSoftNews, scoreEvents } from "../src/events/rank";
import { runIngest } from "../src/run/ingest";
import type { Article } from "../src/schema";
import type { NewsSource } from "../src/sources/types";

let counter = 0;
function article(over: Partial<Article> & Pick<Article, "title">): Article {
  counter++;
  return {
    id: `t:${counter}`,
    url: `https://site${counter}.example/${counter}`,
    outlet: `site${counter}.example`,
    domain: `site${counter}.example`,
    language: "en",
    publishedAt: "2026-11-02T06:00:00.000Z",
    sourceId: "gdelt",
    countries: [],
    places: [],
    themes: [],
    entities: [],
    curated: false,
    ...over,
  };
}

const NOW = new Date("2026-11-02T08:00:00Z");

/** Three real events plus noise, in mixed order and phrasing. */
function sampleArticles(): Article[] {
  const quake = (title: string, extra: Partial<Article> = {}) =>
    article({
      title,
      countries: ["JP"],
      entities: ["japan meteorological agency", "fumio kishida"],
      places: [{ name: "Sendai, Miyagi, Japan", at: [140.87, 38.27], country: "JP", kind: "city" }],
      ...extra,
    });
  const budget = (title: string, extra: Partial<Article> = {}) =>
    article({
      title,
      countries: ["DE"],
      entities: ["friedrich merz", "bundestag"],
      places: [{ name: "Berlin, Berlin, Germany", at: [13.4, 52.52], country: "DE", kind: "city" }],
      ...extra,
    });
  return [
    quake("Strong earthquake shakes northern Japan, tsunami warning issued"),
    quake("Tsunami warning after strong earthquake in northern Japan"),
    quake("Northern Japan earthquake: tsunami warning lifted after hours"),
    quake("Japón: fuerte terremoto y alerta de tsunami en el norte", { language: "es" }),
    quake("Fuerte terremoto en el norte de Japón activa alerta de tsunami", { language: "es" }),
    budget("German coalition agrees budget deal after marathon talks"),
    budget("German coalition agrees budget deal after marathon talks, Merz says"),
    budget("Koalition einigt sich auf Haushalt", {
      language: "de",
      curated: true,
      outlet: "Tagesschau",
      sourceId: "rss:tagesschau",
    }),
    budget("Haushalt: Koalition einigt sich nach langer Nacht", { language: "de" }),
    article({
      title: "Champion striker scores twice as league leaders win derby",
      countries: ["GB"],
      themes: ["TAX_FNCACT_CHAMPION"],
    }),
    article({
      title: "Champion striker double secures derby win for league leaders",
      countries: ["GB"],
      themes: ["TAX_FNCACT_CHAMPION"],
    }),
    article({ title: "Local bakery celebrates its hundredth anniversary this weekend", countries: ["US"] }),
  ];
}

describe("dedupe", () => {
  it("keeps one copy per URL, preferring curated feeds", () => {
    const a = article({ title: "Same story everywhere today", url: "https://x.example/1" });
    const b = article({ title: "Same story everywhere today", url: "https://x.example/1", curated: true });
    expect(dedupe([a, b])).toEqual([b]);
  });
});

describe("siteBoilerplate", () => {
  it("finds words a site repeats in most headlines", () => {
    const site = { domain: "habersefi.com", outlet: "habersefi.com" };
    const boiler = siteBoilerplate([
      article({ ...site, title: "Canik bağımsızlık mesajı Haber Sitesi" }),
      article({ ...site, title: "Alzheimer belirtileri erken başlıyor Haber Sitesi" }),
      article({ ...site, title: "Fiyat endeksi açıklandı Haber Sitesi" }),
      article({ ...site, title: "Yeni yol projesi tamamlandı Haber Sitesi" }),
    ]);
    expect(boiler.has("habersefi.com|haber")).toBe(true);
    expect(boiler.has("habersefi.com|sitesi")).toBe(true);
    expect(boiler.has("habersefi.com|canik")).toBe(false);
  });
});

describe("clusterArticles", () => {
  const events = clusterArticles(sampleArticles());
  const sizes = events.map((e) => e.articles.length).sort((a, b) => b - a);

  it("groups articles about the same event, across languages via shared names", () => {
    expect(sizes.slice(0, 3)).toEqual([5, 4, 2]);
    const quake = events.find((e) => e.title.includes("earthquake"));
    expect([...(quake?.languages ?? [])].sort()).toEqual(["en", "es"]);
  });

  it("keeps unrelated stories apart", () => {
    expect(events.find((e) => e.title.includes("bakery"))?.articles).toHaveLength(1);
  });

  it("counts country weight per distinct headline", () => {
    const budget = events.find((e) => e.title.toLowerCase().includes("budget"));
    expect(budget?.countries[0]).toEqual({ iso2: "DE", weight: 1 });
    expect(budget?.curatedOutlets).toBe(1);
  });
});

describe("scoreEvents", () => {
  it("ranks broad hard news above sport", () => {
    const scored = scoreEvents(clusterArticles(sampleArticles()), NOW);
    const sport = scored.find((e) => isSoftNews(e));
    expect(sport).toBeDefined();
    expect(scored[0]?.title).toMatch(/earthquake|budget|Koalition/i);
    expect(scored.findIndex((e) => e === sport)).toBeGreaterThan(1);
    expect(Math.max(...scored.map((e) => e.score))).toBe(100);
  });
});

describe("buildChapters", () => {
  const chapters = buildChapters(scoreEvents(clusterArticles(sampleArticles()), NOW));
  const chapter = (scope: string) => chapters.find((c) => c.scope === scope);

  it("creates a chapter for every region and country plus Global", () => {
    expect(chapter("global")).toBeDefined();
    expect(chapter("europe")).toBeDefined();
    expect(chapters.length).toBeGreaterThan(200);
  });

  it("places events in the right countries and home regions", () => {
    expect(chapter("DE")?.eventIds).toHaveLength(1);
    expect(chapter("JP")?.eventIds).toHaveLength(1);
    expect(chapter("asia")?.eventIds).toEqual(chapter("JP")?.eventIds);
    expect(chapter("europe")?.eventIds).toContain(chapter("DE")?.eventIds[0]);
  });

  it("needs two or more outlets and explains empty chapters", () => {
    expect(chapter("US")?.eventIds).toHaveLength(0);
    expect(chapter("US")?.emptyReason).toContain("United States");
  });
});

describe("runIngest", () => {
  it("writes ingest.json, report.md and status.json, and survives a failing source", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "dawn-ingest-"));
    try {
      const good: NewsSource = { id: "fake", fetchArticles: () => Promise.resolve(sampleArticles()) };
      const broken: NewsSource = { id: "broken", fetchArticles: () => Promise.reject(new Error("down")) };
      const { status } = await runIngest({ sources: [good, broken], outDir, cacheDir: outDir, now: NOW });
      expect(status.ok).toBe(true);
      expect(status.errors).toEqual(["Source broken failed: down"]);
      const ingest = JSON.parse(await readFile(join(outDir, "ingest.json"), "utf8")) as { events: unknown[] };
      expect(ingest.events.length).toBe(status.counts.events);
      expect(await readFile(join(outDir, "report.md"), "utf8")).toContain("## Global");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("reports failure when no source delivers", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "dawn-ingest-"));
    try {
      const empty: NewsSource = { id: "empty", fetchArticles: () => Promise.resolve([]) };
      const { status } = await runIngest({ sources: [empty], outDir, cacheDir: outDir, now: NOW });
      expect(status.ok).toBe(false);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
