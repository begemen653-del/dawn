/**
 * Curated news feeds. GDELT covers every country; these hand-picked feeds add reliable,
 * well-known outlets for the priority regions and countries and are ranked a little higher.
 *
 * Adding coverage for a country = adding a feed with that country's ISO2 code in `scopes`.
 * We only read headlines, links and times from feeds; article text is never stored or shown.
 * Every feed was checked to respond; robots.txt is re-checked on every run and a refusal skips the feed.
 */
import type { RegionId } from "./types";

/** A region id or an ISO 3166-1 alpha-2 country code. */
export type FeedScope = RegionId | (string & {});

export interface FeedSource {
  readonly id: string;
  /** Outlet name as shown to the user. */
  readonly outlet: string;
  readonly url: string;
  /** ISO 639-1 */
  readonly language: string;
  /** Where the outlet is based (ISO2). */
  readonly country: string;
  /** Chapters this feed mainly serves; stories are still placed by what they are about. */
  readonly scopes: readonly FeedScope[];
  /** Topic hint for themed feeds. */
  readonly topic?: "technology" | "business";
  /** What we know about reuse. See docs/PIPELINE.md for the full notes. */
  readonly terms: string;
}

// Verified Nov 2026: bbc.com/pages/terms-of-use (§1, §12), theguardian.com/help/feeds,
// npr.org/about-npr/179881519. All allow personal, non-commercial use — Dawn qualifies only while
// it stays a private app for its owner. See docs/PIPELINE.md "Feed terms" for the open questions.
const BBC_TERMS =
  "BBC: personal, non-commercial use; credit BBC News with a link. Its terms also say not to extract metadata from feeds (flagged as unclear).";
const GUARDIAN_TERMS =
  "Guardian: personal, non-commercial use via a feed reader, under its terms of service.";
const NPR_TERMS = "NPR: personal, non-commercial use under its Terms of Use (content feeds section).";
const DW_TERMS = "DW: public RSS feed; written terms not found yet (to confirm). Headline link only.";
const PUBLIC_RSS = "Public RSS feed; written terms not reviewed yet (to confirm). Headline link only.";

export const FEEDS: readonly FeedSource[] = [
  // Global
  {
    id: "bbc-world",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["global"],
    terms: BBC_TERMS,
  },
  {
    id: "guardian-world",
    outlet: "The Guardian",
    url: "https://www.theguardian.com/world/rss",
    language: "en",
    country: "GB",
    scopes: ["global"],
    terms: GUARDIAN_TERMS,
  },
  {
    id: "aljazeera",
    outlet: "Al Jazeera",
    url: "https://www.aljazeera.com/xml/rss/all.xml",
    language: "en",
    country: "QA",
    scopes: ["global", "middle-east"],
    terms: PUBLIC_RSS,
  },
  {
    id: "dw-world",
    outlet: "DW",
    url: "https://rss.dw.com/rdf/rss-en-all",
    language: "en",
    country: "DE",
    scopes: ["global"],
    terms: DW_TERMS,
  },
  {
    id: "france24",
    outlet: "France 24",
    url: "https://www.france24.com/en/rss",
    language: "en",
    country: "FR",
    scopes: ["global", "europe", "africa"],
    terms: PUBLIC_RSS,
  },
  {
    id: "npr-world",
    outlet: "NPR",
    url: "https://feeds.npr.org/1004/rss.xml",
    language: "en",
    country: "US",
    scopes: ["global"],
    terms: NPR_TERMS,
  },

  // Europe
  {
    id: "bbc-europe",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/europe/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["europe"],
    terms: BBC_TERMS,
  },
  {
    id: "guardian-europe",
    outlet: "The Guardian",
    url: "https://www.theguardian.com/world/europe-news/rss",
    language: "en",
    country: "GB",
    scopes: ["europe"],
    terms: GUARDIAN_TERMS,
  },
  {
    id: "dw-europe",
    outlet: "DW",
    url: "https://rss.dw.com/rdf/rss-en-eu",
    language: "en",
    country: "DE",
    scopes: ["europe"],
    terms: DW_TERMS,
  },
  {
    id: "euronews",
    outlet: "Euronews",
    url: "https://www.euronews.com/rss?level=theme&name=news",
    language: "en",
    country: "FR",
    scopes: ["europe"],
    terms: PUBLIC_RSS,
  },
  {
    id: "politico-eu",
    outlet: "Politico Europe",
    url: "https://www.politico.eu/feed/",
    language: "en",
    country: "BE",
    scopes: ["europe"],
    terms: PUBLIC_RSS,
  },

  // Germany
  {
    id: "tagesschau",
    outlet: "Tagesschau",
    url: "https://www.tagesschau.de/xml/rss2/",
    language: "de",
    country: "DE",
    scopes: ["DE"],
    terms: "Tagesschau RSS: provided by ARD for private use; headline + link only.",
  },
  {
    id: "dw-germany",
    outlet: "DW",
    url: "https://rss.dw.com/rdf/rss-en-ger",
    language: "en",
    country: "DE",
    scopes: ["DE"],
    terms: DW_TERMS,
  },

  // Türkiye
  {
    id: "anadolu-en",
    outlet: "Anadolu Agency",
    url: "https://www.aa.com.tr/en/rss/default?cat=guncel",
    language: "en",
    country: "TR",
    scopes: ["TR"],
    terms: PUBLIC_RSS,
  },
  {
    id: "hurriyet-daily-news",
    outlet: "Hürriyet Daily News",
    url: "https://www.hurriyetdailynews.com/rss.aspx",
    language: "en",
    country: "TR",
    scopes: ["TR"],
    terms: PUBLIC_RSS,
  },
  {
    id: "trt-haber",
    outlet: "TRT Haber",
    url: "https://www.trthaber.com/manset_articles.rss",
    language: "tr",
    country: "TR",
    scopes: ["TR"],
    terms: PUBLIC_RSS,
  },
  {
    id: "bianet-en",
    outlet: "bianet",
    url: "https://bianet.org/english/rss",
    language: "en",
    country: "TR",
    scopes: ["TR"],
    terms: PUBLIC_RSS,
  },

  // Asia
  {
    id: "bbc-asia",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/asia/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["asia"],
    terms: BBC_TERMS,
  },
  {
    id: "the-hindu-world",
    outlet: "The Hindu",
    url: "https://www.thehindu.com/news/international/feeder/default.rss",
    language: "en",
    country: "IN",
    scopes: ["asia", "IN"],
    terms: PUBLIC_RSS,
  },
  {
    id: "scmp",
    outlet: "South China Morning Post",
    url: "https://www.scmp.com/rss/3/feed",
    language: "en",
    country: "HK",
    scopes: ["asia", "CN"],
    terms: PUBLIC_RSS,
  },
  {
    id: "nhk-world",
    outlet: "NHK",
    url: "https://www3.nhk.or.jp/rss/news/cat0.xml",
    language: "ja",
    country: "JP",
    scopes: ["JP"],
    terms: PUBLIC_RSS,
  },

  // Americas
  {
    id: "bbc-us-canada",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["north-america", "US"],
    terms: BBC_TERMS,
  },
  {
    id: "npr-news",
    outlet: "NPR",
    url: "https://feeds.npr.org/1001/rss.xml",
    language: "en",
    country: "US",
    scopes: ["north-america", "US"],
    terms: NPR_TERMS,
  },
  {
    id: "bbc-latin-america",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/latin_america/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["south-america", "north-america"],
    terms: BBC_TERMS,
  },

  // Middle East, Africa, Oceania
  {
    id: "bbc-middle-east",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["middle-east"],
    terms: BBC_TERMS,
  },
  {
    id: "bbc-africa",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["africa"],
    terms: BBC_TERMS,
  },
  {
    id: "bbc-australia",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/world/australia/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["oceania"],
    terms: BBC_TERMS,
  },
  {
    id: "abc-au",
    outlet: "ABC News (Australia)",
    url: "https://www.abc.net.au/news/feed/2942460/rss.xml",
    language: "en",
    country: "AU",
    scopes: ["oceania", "AU"],
    terms: PUBLIC_RSS,
  },

  // Technology, AI and economy
  {
    id: "bbc-technology",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/technology/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["global"],
    topic: "technology",
    terms: BBC_TERMS,
  },
  {
    id: "guardian-technology",
    outlet: "The Guardian",
    url: "https://www.theguardian.com/technology/rss",
    language: "en",
    country: "GB",
    scopes: ["global"],
    topic: "technology",
    terms: GUARDIAN_TERMS,
  },
  {
    id: "ars-technica",
    outlet: "Ars Technica",
    url: "https://feeds.arstechnica.com/arstechnica/index",
    language: "en",
    country: "US",
    scopes: ["global"],
    topic: "technology",
    terms: PUBLIC_RSS,
  },
  {
    id: "bbc-business",
    outlet: "BBC News",
    url: "https://feeds.bbci.co.uk/news/business/rss.xml",
    language: "en",
    country: "GB",
    scopes: ["global"],
    topic: "business",
    terms: BBC_TERMS,
  },
  {
    id: "guardian-business",
    outlet: "The Guardian",
    url: "https://www.theguardian.com/business/rss",
    language: "en",
    country: "GB",
    scopes: ["global"],
    topic: "business",
    terms: GUARDIAN_TERMS,
  },
];
