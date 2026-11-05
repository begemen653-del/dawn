import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BudgetExceededError, FallbackChain, RequestTooLargeError } from "../src/ai/chain";
import type { StoryDraft } from "../src/ai/drafts";
import { checkGrounding } from "../src/ai/grounding";
import { extractJson, RateGate } from "../src/ai/http-providers";
import { MockLlmProvider } from "../src/ai/mock";
import { renderEvent, SYSTEM_PROMPT, type PlaceCandidate } from "../src/ai/prompts";
import { InvalidOutputError, QuotaError, type LlmProvider } from "../src/ai/provider";
import { buildScene } from "../src/ai/scene";
import { buildInput, summarizeEvents } from "../src/ai/summarize";
import { buildChapters } from "../src/events/assign";
import { clusterArticles } from "../src/events/cluster";
import { scoreEvents } from "../src/events/rank";
import { dropKind, finalChapters, runBrief } from "../src/run/brief";
import { DayIndex, EventStore, Playlist, type Article, type StoryEvent } from "../src/schema";
import { excerpt, extractArticleText } from "../src/sources/article-text";

const NOW = new Date("2026-11-02T08:00:00Z");

const draft = (over: Partial<StoryDraft> = {}): StoryDraft => ({
  id: "ev-1",
  relevant: true,
  headline: "Nine people die in a plane crash in Florida",
  summary: "A small plane crashed near Fort Lauderdale, killing 9 people, officials said.",
  whyItMatters: "Investigators will look at the cause.",
  topic: "disaster",
  developing: true,
  countries: ["US"],
  places: ["P1"],
  visual: { kind: "point" },
  deeper: null,
  ...over,
});

const evidence = {
  text: "Nine killed in Florida plane crash near Fort Lauderdale. Officials said the jet hit a home. 2026-11-02",
  names: ["Fort Lauderdale, Florida, United States", "United States"],
};

describe("grounding check", () => {
  it("accepts a story that only uses source facts (number words count as digits)", () => {
    expect(checkGrounding(draft(), evidence)).toEqual({ ok: true, issues: [] });
  });

  it("rejects invented numbers", () => {
    const result = checkGrounding(
      draft({ summary: "A plane crashed near Fort Lauderdale, killing 12 people." }),
      evidence,
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toContain('"12"');
  });

  it("rejects quotes that are not in the sources", () => {
    const result = checkGrounding(
      draft({ whyItMatters: 'The mayor called it "a terrible day for our whole city".' }),
      evidence,
    );
    expect(result.ok).toBe(false);
  });

  it("rejects several unknown names, tolerates one", () => {
    expect(
      checkGrounding(draft({ whyItMatters: "Governor Smithson will visit the site." }), evidence).ok,
    ).toBe(true);
    expect(
      checkGrounding(draft({ whyItMatters: "Governor Smithson and Senator Okonkwo will visit." }), evidence)
        .ok,
    ).toBe(false);
  });

  it("does not count generic titles, possessives, name variants or clock minutes", () => {
    const ok = (whyItMatters: string) => checkGrounding(draft({ whyItMatters }), evidence).ok;
    expect(ok("The Senate and the House of Representatives in Congress will debate it.")).toBe(true);
    expect(ok("Florida's Governor said the Fort Lauderdale site will be cleared.")).toBe(true);
    expect(ok("The Bavarian state of Bavaria offered help.")).toBe(true);
    expect(ok("Officials will meet at 8:00 near Fort Lauderdale.")).toBe(false); // 8 is not in the sources
    expect(ok("Officials said Smithson and Okonkwo of the Ministry will visit.")).toBe(false);
  });

  it("also checks Go deeper content", () => {
    const deeper = {
      background: "It began in 1998.",
      keyPlayers: [],
      whatNext: "Unclear.",
      timeline: [],
      simpler: "A plane fell.",
    };
    expect(checkGrounding(draft({ deeper }), evidence).ok).toBe(false);
  });
});

describe("scene builder", () => {
  const candidates: PlaceCandidate[] = [
    {
      id: "P1",
      name: "Fort Lauderdale, Florida, United States",
      at: [-80.14, 26.12],
      country: "US",
      kind: "city",
    },
    { id: "P2", name: "Havana, Cuba", at: [-82.36, 23.13], country: "CU", kind: "city" },
  ];

  it("uses our coordinates and marks the main place", () => {
    const { scene, locations } = buildScene(draft(), candidates, "disaster");
    expect(scene.camera).toMatchObject({ lng: -80.14, lat: 26.12 });
    expect(scene.elements).toContainEqual(
      expect.objectContaining({ type: "highlight", country: "US", tone: "alert" }),
    );
    expect(scene.elements).toContainEqual(
      expect.objectContaining({ type: "marker", label: "Fort Lauderdale" }),
    );
    expect(locations[0]).toEqual({ name: "Fort Lauderdale", at: [-80.14, 26.12], country: "US" });
  });

  it("draws a route between two chosen places", () => {
    const { scene } = buildScene(
      draft({ places: ["P2", "P1"], visual: { kind: "route", from: "P2", to: "P1", routeKind: "flight" } }),
      candidates,
      "other",
    );
    expect(scene.elements).toContainEqual(
      expect.objectContaining({ type: "arc", kind: "flight", from: [-82.36, 23.13] }),
    );
  });

  it("ignores place ids the model invented and falls back to the country", () => {
    const { locations } = buildScene(draft({ places: ["P9"] }), candidates, "other");
    expect(locations[0]?.name).toBe("United States");
  });
});

describe("provider plumbing", () => {
  it("extracts JSON from fenced or chatty replies", () => {
    expect(extractJson('Sure! ```json\n{"a": 1}\n``` done')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow(InvalidOutputError);
  });

  it("paces requests per minute", async () => {
    let clock = 0;
    const waits: number[] = [];
    const gate = new RateGate(
      { requestsPerMinute: 2, tokensPerMinute: 1_000_000 },
      () => clock,
      (ms) => {
        waits.push(ms);
        clock += ms;
        return Promise.resolve();
      },
    );
    await gate.take(10);
    await gate.take(10);
    await gate.take(10);
    expect(waits).toHaveLength(1);
    expect(clock).toBeGreaterThanOrEqual(60_000);
  });

  const schema = z.object({ ok: z.boolean() });
  const fake = (name: string, behave: () => Promise<unknown>): LlmProvider => ({
    name,
    generateJson: async <T>(_r: unknown, s: z.ZodType<T>) => ({
      value: s.parse(await behave()),
      usage: { inputTokens: 10, outputTokens: 5 },
      provider: name,
    }),
  });
  const request = { system: "s", prompt: "p", maxOutputTokens: 10 };
  const noSleep = () => Promise.resolve();

  it("falls back when a provider's quota is used up, and skips it afterwards", async () => {
    let quotaCalls = 0;
    const chain = new FallbackChain(
      [
        fake("a", () => {
          quotaCalls++;
          return Promise.reject(new QuotaError("used up"));
        }),
        fake("b", () => Promise.resolve({ ok: true })),
      ],
      { tokenBudget: 1000, attemptsPerProvider: 2, sleep: noSleep },
    );
    expect((await chain.generateJson(request, schema)).provider).toBe("b");
    await chain.generateJson(request, schema);
    expect(quotaCalls).toBe(1);
    expect(chain.tokensSpent).toBe(30);
  });

  it("retries invalid output, then moves on", async () => {
    let tries = 0;
    const chain = new FallbackChain(
      [
        fake("a", () => {
          tries++;
          return Promise.reject(new InvalidOutputError("bad"));
        }),
        fake("b", () => Promise.resolve({ ok: true })),
      ],
      { tokenBudget: 1000, attemptsPerProvider: 2, sleep: noSleep },
    );
    expect((await chain.generateJson(request, schema)).provider).toBe("b");
    expect(tries).toBe(2);
  });

  it("skips models that can't take a request this big", async () => {
    const small = { ...fake("small", () => Promise.resolve({ ok: true })), maxRequestTokens: 5 };
    const chain = new FallbackChain([small, fake("big", () => Promise.resolve({ ok: true }))], {
      tokenBudget: 1000,
      attemptsPerProvider: 1,
      sleep: noSleep,
    });
    expect((await chain.generateJson(request, schema)).provider).toBe("big");
    const onlySmall = new FallbackChain([small], {
      tokenBudget: 1000,
      attemptsPerProvider: 1,
      sleep: noSleep,
    });
    await expect(onlySmall.generateJson(request, schema)).rejects.toThrow(RequestTooLargeError);
  });

  it("groups drop reasons for the run status", () => {
    expect(dropKind("not a clear news event")).toBe("not news");
    expect(dropKind('number "40" is not in the sources')).toBe("failed the fact check");
    expect(dropKind("names not found in the sources: A, B")).toBe("failed the fact check");
    expect(dropKind("no place to show on the globe")).toBe("incomplete");
    expect(dropKind("Reply did not match the schema: x")).toBe("bad AI format");
  });

  it("stops at the daily token budget", async () => {
    const chain = new FallbackChain([fake("a", () => Promise.resolve({ ok: true }))], {
      tokenBudget: 5,
      attemptsPerProvider: 1,
      sleep: noSleep,
    });
    await expect(chain.generateJson(request, schema)).rejects.toThrow(BudgetExceededError);
  });

  it("puts the accuracy rules in every system prompt", () => {
    expect(SYSTEM_PROMPT).toContain("Use ONLY facts stated in the sources");
    expect(SYSTEM_PROMPT).toContain("If sources disagree");
    expect(SYSTEM_PROMPT).toContain("attribute claims");
  });
});

describe("article reader", () => {
  it("extracts the main text and skips navigation", () => {
    const body = "The city council approved the new tram line on Monday after a long debate. ".repeat(8);
    const html = `<html><head><title>X</title></head><body><nav>Home News Sport</nav>
      <article><h1>Tram line approved</h1><p>${body}</p><p>${body}</p></article><footer>Cookies</footer></body></html>`;
    const text = extractArticleText(html, "https://example.com/a");
    expect(text).toContain("The city council approved the new tram line");
    expect(text).not.toContain("Cookies");
  });

  it("returns null for pages without article text", () => {
    expect(
      extractArticleText("<html><body><p>Subscribe</p></body></html>", "https://example.com"),
    ).toBeNull();
  });

  it("cuts excerpts at a sentence end", () => {
    const text = "A short sentence. ".repeat(200);
    const cut = excerpt(text, 100);
    expect(cut.length).toBeLessThanOrEqual(100);
    expect(cut.endsWith(".")).toBe(true);
  });
});

let n = 0;
function article(title: string, over: Partial<Article> = {}): Article {
  n++;
  return {
    id: `a${n}`,
    url: `https://news${n}.example/${n}`,
    title,
    outlet: `news${n}.example`,
    domain: `news${n}.example`,
    language: "en",
    publishedAt: "2026-11-02T06:00:00.000Z",
    sourceId: "gdelt",
    countries: ["DE"],
    places: [{ name: "Berlin, Berlin, Germany", at: [13.4, 52.52], country: "DE", kind: "city" }],
    themes: [],
    entities: ["friedrich merz"],
    curated: false,
    ...over,
  };
}

function germanEvents() {
  const articles = [
    article("German coalition agrees budget deal after marathon talks"),
    article("German coalition agrees budget deal after marathon talks, Merz says"),
    article("German coalition budget deal agreed after marathon talks"),
    article("Berlin city marathon draws record crowd of runners", { entities: [] }),
    article("Berlin city marathon draws record crowd of runners again", { entities: [] }),
  ];
  const events = scoreEvents(clusterArticles(articles), NOW);
  return { events, chapters: buildChapters(events) };
}

describe("summarizeEvents with a mock model", () => {
  it("writes grounded stories with scenes and sources", async () => {
    const { events } = germanEvents();
    const result = await summarizeEvents(events, new MockLlmProvider(), {
      deep: new Set([events[0]?.id ?? ""]),
      texts: new Map(),
      maxBatchTokens: 7000,
      maxBatchSize: 6,
    });
    expect(result.stories.size).toBe(2);
    const story = result.stories.get(events[0]?.id ?? "");
    expect(story?.sources.length).toBeGreaterThanOrEqual(2);
    expect(story?.scene.elements.some((e) => e.type === "marker")).toBe(true);
    expect(story?.deeper).not.toBeNull();
    expect(story?.aiGenerated).toBe(true);
  });

  it("renders the candidate places and countries for the model", () => {
    const { events } = germanEvents();
    const e = events[0];
    if (!e) throw new Error("no event");
    const text = renderEvent(buildInput(e, false, new Map()));
    expect(text).toContain("Candidate countries: DE (Germany)");
    expect(text).toMatch(/P1: Berlin, Berlin, Germany \(city\)/);
  });
});

describe("finalChapters", () => {
  it("removes stories the AI says are not about that country", () => {
    const story = { id: "e1", countries: ["US"] } as unknown as StoryEvent;
    const chapters = finalChapters(
      [
        { scope: "DE", title: "Germany", eventIds: ["e1"] },
        { scope: "US", title: "United States", eventIds: ["e1"] },
        { scope: "north-america", title: "North America", eventIds: ["e1"] },
      ],
      new Map([["e1", story]]),
    );
    expect(chapters[0]?.eventIds).toEqual([]);
    expect(chapters[0]?.emptyReason).toContain("Germany");
    expect(chapters[1]?.eventIds).toEqual(["e1"]);
    expect(chapters[2]?.eventIds).toEqual(["e1"]);
  });
});

describe("runBrief (end to end, mock model)", () => {
  it("publishes a valid brief the app can read", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "dawn-brief-"));
    try {
      const { events, chapters } = germanEvents();
      const { published, status } = await runBrief({
        events,
        chapters,
        llm: new MockLlmProvider(),
        outDir,
        cacheDir: outDir,
        now: NOW,
        readTexts: false,
        minStories: 1,
      });
      expect(published).toBe(true);
      expect(status.ok).toBe(true);
      const read = async (p: string) => JSON.parse(await readFile(join(outDir, p), "utf8")) as unknown;
      const index = DayIndex.parse(await read("latest/index.json"));
      const store = EventStore.parse(await read("latest/events.json"));
      expect(index.sample).toBe(false);
      const de = Playlist.parse(await read("latest/playlists/DE.json"));
      expect(de.eventIds.length).toBeGreaterThan(0);
      for (const id of de.eventIds) expect(store.events.some((e) => e.id === id)).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("keeps the previous brief when too few stories come out", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "dawn-brief-"));
    try {
      const { events, chapters } = germanEvents();
      const { published } = await runBrief({
        events,
        chapters,
        llm: new MockLlmProvider(),
        outDir,
        cacheDir: outDir,
        now: NOW,
        readTexts: false,
        minStories: 50,
      });
      expect(published).toBe(false);
      await expect(readFile(join(outDir, "latest", "index.json"))).rejects.toThrow();
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
