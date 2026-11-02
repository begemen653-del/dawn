import { FEEDS, type FeedSource } from "@dawn/config";
import { XMLParser } from "fast-xml-parser";
import { join } from "node:path";
import type { Article } from "../schema";
import { canonicalUrl, cleanTitle, decodeEntities, domainOf } from "../events/text";
import { PoliteFetcher } from "./http";
import type { FetchContext, NewsSource } from "./types";

export interface FeedItem {
  readonly title: string;
  readonly link: string;
  readonly published: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  processEntities: true,
  htmlEntities: true,
  // Keep everything as strings; feeds are messy.
  parseTagValue: false,
  isArray: (name) => name === "item" || name === "entry" || name === "link",
});

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) return text(value["#text"]);
  return "";
}

function atomLink(links: unknown): string {
  if (!Array.isArray(links)) return text(links);
  const objects = links.filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null);
  const alternate = objects.find((l) => l["@rel"] === undefined || l["@rel"] === "alternate");
  if (alternate) return text(alternate["@href"]);
  return text(links[0]);
}

/** Parses RSS 2.0, RSS 1.0 (RDF, used by DW) and Atom into plain items. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const rss = doc.rss as { channel?: { item?: unknown[] } } | undefined;
  const rdf = doc["rdf:RDF"] as { item?: unknown[] } | undefined;
  const atom = doc.feed as { entry?: unknown[] } | undefined;
  const raw = rss?.channel?.item ?? rdf?.item ?? atom?.entry ?? [];

  const items: FeedItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    // CDATA titles skip the XML parser's entity decoding, so decode here too.
    const title = decodeEntities(text(e.title)).trim();
    const link = (atom ? atomLink(e.link) : text(Array.isArray(e.link) ? e.link[0] : e.link)).trim();
    const published = text(e.pubDate ?? e["dc:date"] ?? e.published ?? e.updated).trim();
    if (title && link) items.push({ title, link, published: published === "" ? null : published });
  }
  return items;
}

export function itemToArticle(item: FeedItem, feed: FeedSource, fallbackTime: Date): Article | null {
  const url = canonicalUrl(item.link);
  if (!url) return null;
  const parsed = item.published ? new Date(item.published) : null;
  const time = parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallbackTime;
  const title = cleanTitle(item.title, feed.outlet).slice(0, 400);
  if (title.length < 8) return null;
  // Feeds scoped to a country are about that country; region/global feeds get countries from GDELT matches.
  const scopedCountries = feed.scopes.filter((s) => /^[A-Z]{2}$/.test(s));
  return {
    id: `rss:${feed.id}:${url}`,
    url,
    title,
    outlet: feed.outlet,
    domain: domainOf(url),
    language: feed.language,
    publishedAt: time.toISOString(),
    sourceId: `rss:${feed.id}`,
    countries: scopedCountries,
    sourceCountry: feed.country,
    places: [],
    themes: feed.topic ? [feed.topic === "technology" ? "TECHNOLOGY" : "ECON"] : [],
    entities: [],
    curated: true,
  };
}

/** All curated feeds. A failing feed only adds a warning. */
export class RssSource implements NewsSource {
  readonly id = "rss";

  constructor(private readonly feeds: readonly FeedSource[] = FEEDS) {}

  async fetchArticles(ctx: FetchContext): Promise<Article[]> {
    const fetcher = new PoliteFetcher({ cacheDir: join(ctx.cacheDir, "http") });
    const results = await Promise.all(
      this.feeds.map(async (feed) => {
        try {
          const { body } = await fetcher.getText(feed.url);
          return parseFeed(body)
            .map((item) => itemToArticle(item, feed, ctx.now))
            .filter((a): a is Article => a !== null && new Date(a.publishedAt) >= ctx.since);
        } catch (error) {
          ctx.warn(`Feed ${feed.id} skipped: ${error instanceof Error ? error.message : String(error)}`);
          return [];
        }
      }),
    );
    await fetcher.saveIndex().catch(() => undefined);
    return results.flat();
  }
}
