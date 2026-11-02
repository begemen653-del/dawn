/**
 * Sample data for the dry run and tests. These are NOT real news: every text says so,
 * and the source links point to outlet home pages. Real stories arrive in Milestone 3–4.
 */
import type { LearnCard, StoryEvent } from "../src/schema";

const time = "2026-11-02T05:00:00+01:00";

export const SAMPLE_EVENTS: StoryEvent[] = [
  {
    id: "sample-berlin-overview",
    headline: "Sample story: this is where a German headline will appear",
    summary:
      "This card is a placeholder. Each morning it will explain one real story from Germany in two or three plain sentences, written by AI from the linked sources.",
    whyItMatters:
      "Shows how the explanation card, sources and the globe fit together before real news is connected.",
    topic: "politics",
    time,
    developing: false,
    locations: [{ name: "Berlin", at: [13.405, 52.52], country: "DE" }],
    sources: [
      {
        outlet: "Tagesschau",
        title: "Tagesschau home page (sample link)",
        url: "https://www.tagesschau.de/",
        publishedAt: time,
        language: "de",
      },
      {
        outlet: "DW",
        title: "DW home page (sample link)",
        url: "https://www.dw.com/en/",
        publishedAt: time,
        language: "en",
      },
    ],
    aiGenerated: true,
    importance: 80,
    countries: ["DE"],
    scene: {
      camera: { lng: 13.405, lat: 52.52, zoom: 5.5 },
      elements: [
        { type: "highlight", id: "de", country: "DE", tone: "focus" },
        { type: "marker", id: "berlin", at: [13.405, 52.52], label: "Berlin", emphasis: "primary" },
      ],
    },
    images: [],
    deeper: {
      background: "Sample background: this section will explain how the story started.",
      keyPlayers: [{ name: "Sample player", role: "Who is involved and why" }],
      whatNext: "Sample outlook: what could happen next, according to the sources.",
      timeline: [{ date: "Earlier", label: "How it began (sample)" }],
      simpler: "Sample: the same story, explained even more simply.",
    },
  },
  {
    id: "sample-istanbul-route",
    headline: "Sample story: a Turkish headline with a route on the map",
    summary:
      "This placeholder shows how Dawn will draw movement between places, such as a shipping route. The arc on the globe connects two cities.",
    whyItMatters: "Demonstrates arcs and multiple markers in a scene directive.",
    topic: "economy",
    time,
    developing: true,
    locations: [
      { name: "Istanbul", at: [28.978, 41.008], country: "TR" },
      { name: "Ankara", at: [32.854, 39.92], country: "TR" },
    ],
    sources: [
      {
        outlet: "TRT World",
        title: "TRT World home page (sample link)",
        url: "https://www.trtworld.com/",
        publishedAt: time,
        language: "en",
      },
      {
        outlet: "Hürriyet Daily News",
        title: "Hürriyet Daily News home page (sample link)",
        url: "https://www.hurriyetdailynews.com/",
        publishedAt: time,
        language: "en",
      },
    ],
    aiGenerated: true,
    importance: 70,
    countries: ["TR"],
    scene: {
      camera: { lng: 30.9, lat: 40.5, zoom: 5.2 },
      elements: [
        { type: "marker", id: "istanbul", at: [28.978, 41.008], label: "Istanbul", emphasis: "primary" },
        { type: "marker", id: "ankara", at: [32.854, 39.92], label: "Ankara", emphasis: "secondary" },
        {
          type: "arc",
          id: "route",
          from: [28.978, 41.008],
          to: [32.854, 39.92],
          kind: "route",
          animated: true,
        },
      ],
    },
    images: [],
    deeper: null,
  },
  {
    id: "sample-global-overview",
    headline: "Sample story: the biggest global story of the day goes here",
    summary:
      "Global news is always the last chapter. This placeholder shows a wide shaded area, used for things like storms or regions affected by an event.",
    whyItMatters: "Demonstrates the Global chapter and shaded areas on the globe.",
    topic: "climate",
    time,
    developing: false,
    locations: [{ name: "Geneva", at: [6.143, 46.204], country: "CH" }],
    sources: [
      {
        outlet: "BBC News",
        title: "BBC News home page (sample link)",
        url: "https://www.bbc.com/news",
        publishedAt: time,
        language: "en",
      },
      {
        outlet: "Al Jazeera",
        title: "Al Jazeera home page (sample link)",
        url: "https://www.aljazeera.com/",
        publishedAt: time,
        language: "en",
      },
    ],
    aiGenerated: true,
    importance: 90,
    countries: ["CH"],
    scene: {
      camera: { lng: 6.143, lat: 46.204, zoom: 1.5 },
      elements: [
        {
          type: "area",
          id: "zone",
          center: [6.143, 46.204],
          radiusKm: 400,
          tone: "neutral",
          label: "Sample area",
        },
        { type: "marker", id: "geneva", at: [6.143, 46.204], label: "Geneva", emphasis: "primary" },
      ],
    },
    images: [],
    deeper: null,
  },
];

/** Which sample events each chapter plays, in importance order. */
export const SAMPLE_PLAYLISTS: Readonly<Record<string, readonly string[]>> = {
  global: ["sample-global-overview", "sample-berlin-overview"],
  europe: ["sample-berlin-overview", "sample-istanbul-route"],
  DE: ["sample-berlin-overview"],
  TR: ["sample-istanbul-route"],
};

export const SAMPLE_LEARN: LearnCard = {
  title: "Learn something new (sample)",
  body: "Each day this card will teach one small fact connected to the news, such as what a central bank does or why a strait matters for shipping.",
  relatedEventId: "sample-istanbul-route",
};
