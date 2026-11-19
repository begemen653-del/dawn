import { describe, expect, it } from "vitest";
import type { LlmProvider } from "../src/ai/provider";
import {
  CommonsImages,
  plainText,
  toAsset,
  toFound,
  type CommonsPage,
  type Found,
} from "../src/images/commons";
import { addImages, eventTerms, placesFor, type PhotoSource } from "../src/images/pick";
import type { StoryEvent } from "../src/schema";

function page(
  meta: Record<string, string>,
  extra: Partial<NonNullable<CommonsPage["imageinfo"]>[number]> = {},
): CommonsPage {
  return {
    pageid: 42,
    title: "File:Old town of Tallinn.jpg",
    imageinfo: [
      {
        thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Old.jpg/500px-Old.jpg",
        descriptionurl: "https://commons.wikimedia.org/wiki/File:Old_town_of_Tallinn.jpg",
        width: 4000,
        height: 2500,
        mime: "image/jpeg",
        extmetadata: Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, { value: v }])),
        ...extra,
      },
    ],
  };
}

const GOOD = {
  LicenseShortName: "CC BY-SA 4.0",
  LicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  Artist: '<a href="//commons.wikimedia.org/wiki/User:X">Ivar Leidus</a>',
  ImageDescription: "Old Town of Tallinn from the Patkuli viewing platform",
};

describe("Wikimedia Commons files", () => {
  it("keeps a properly licensed photo with its credit, marked illustrative", () => {
    const img = toAsset(page(GOOD));
    expect(img).toMatchObject({
      provider: "wikimedia-commons",
      author: "Ivar Leidus",
      license: {
        id: "cc-by-sa",
        name: "CC BY-SA 4.0",
        url: "https://creativecommons.org/licenses/by-sa/4.0",
      },
      illustrative: true,
    });
  });

  it("rejects licenses outside the allowlist", () => {
    expect(toAsset(page({ ...GOOD, LicenseShortName: "CC BY-NC 2.0", LicenseUrl: "" }))).toBeNull();
    expect(toAsset(page({ ...GOOD, LicenseShortName: "GFDL", LicenseUrl: "" }))).toBeNull();
    expect(toAsset(page({ ...GOOD, LicenseShortName: "", LicenseUrl: "" }))).toBeNull();
  });

  it("rejects restricted, non-free and authorless files", () => {
    expect(toAsset(page({ ...GOOD, Restrictions: "personality" }))).toBeNull();
    expect(toAsset(page({ ...GOOD, NonFree: "true" }))).toBeNull();
    expect(toAsset(page({ ...GOOD, Artist: "" }))).toBeNull();
    // Public domain needs no named author.
    expect(
      toAsset(page({ ...GOOD, LicenseShortName: "Public domain", LicenseUrl: "", Artist: "" }))?.author,
    ).toBe("Unknown author");
  });

  it("rejects people, animals and small or upright pictures", () => {
    expect(
      toAsset(page({ ...GOOD, ImageDescription: "Jamaican footballer playing in Cincinnati" })),
    ).toBeNull();
    expect(
      toAsset(page({ ...GOOD, ImageDescription: "White Stork ( Ciconia ciconia ) in Madrid" })),
    ).toBeNull();
    expect(toAsset(page(GOOD, { width: 600 }))).toBeNull();
    expect(toAsset(page(GOOD, { width: 2000, height: 3000 }))).toBeNull();
    expect(toAsset(page(GOOD, { mime: "image/svg+xml" }))).toBeNull();
    // "Germany" contains "man" but is not a person.
    expect(toAsset(page({ ...GOOD, ImageDescription: "Römer, Frankfurt, Germany" }))).not.toBeNull();
  });

  it("turns HTML credits into plain text", () => {
    expect(plainText('<bdi><a href="x">Diego&nbsp;Delso</a></bdi> &amp; friends')).toBe(
      "Diego Delso & friends",
    );
  });

  it("searches by position and keeps search order", async () => {
    const urls: string[] = [];
    const commons = new CommonsImages({
      cacheDir: `${process.env.TEMP ?? "/tmp"}/dawn-test-${Date.now()}`,
      fetch: (url) => {
        urls.push(url);
        const second = { ...page(GOOD), pageid: 7, index: 2 };
        const first = { ...page(GOOD), pageid: 9, index: 1 };
        return Promise.resolve(Response.json({ query: { pages: [second, first] } }));
      },
    });
    const found = await commons.near([24.75, 59.44], 12);
    expect(found.map((f) => f.image.id)).toEqual(["commons-9", "commons-7"]);
    expect(decodeURIComponent(urls[0] ?? "")).toContain("nearcoord:12km,59.44,24.75");
    // Second call is served from the cache.
    await commons.near([24.75, 59.44], 12);
    expect(urls).toHaveLength(1);
  });
});

describe("official photos of the event", () => {
  const KREMLIN = {
    ...GOOD,
    LicenseShortName: "CC BY 4.0",
    LicenseUrl: "https://creativecommons.org/licenses/by/4.0",
    Artist: "President of Russia",
    ImageDescription: "Vladimir Putin, Xi Jinping and Donald Trump at the trilateral meeting",
    DateTimeOriginal: "2026-11-18",
  };

  it("accepts official photographers, even with people in the picture", () => {
    expect(toFound(page(KREMLIN), "event")?.takenAt).toBe("2026-11-18");
    // The same picture is never a "place" photo: it shows people.
    expect(toFound(page(KREMLIN), "place")).toBeNull();
  });

  it("does not trust event photos from anyone else", () => {
    expect(toFound(page({ ...KREMLIN, Artist: "Some uploader" }), "event")).toBeNull();
  });
});

function story(id: string, importance: number, at: [number, number], headline = "h"): StoryEvent {
  return {
    id,
    headline,
    summary: "s",
    whyItMatters: "w",
    topic: "politics",
    time: "2026-11-19T04:00:00Z",
    developing: false,
    locations: [{ name: "Tallinn", at }],
    sources: [],
    aiGenerated: true,
    importance,
    countries: ["EE"],
    scene: { camera: { lng: at[0], lat: at[1], zoom: 6 }, elements: [] },
    images: [],
    deeper: null,
  } as unknown as StoryEvent;
}

function found(n: number, alt = "Old town", takenAt: string | null = null): Found {
  const img = toAsset({ ...page({ ...GOOD, ImageDescription: alt }), pageid: n });
  if (!img) throw new Error("test photo was rejected");
  return { image: img, takenAt, uploadedAt: null };
}

/** A fake AI that answers with fixed choices. */
function judge(choices: Record<string, { p: string; showsEvent: boolean }[]>): LlmProvider {
  return {
    name: "fake",
    generateJson: <T>(_request: unknown, schema: { parse: (v: unknown) => T }) =>
      Promise.resolve({
        value: schema.parse({ stories: Object.entries(choices).map(([id, photos]) => ({ id, photos })) }),
        usage: { inputTokens: 0, outputTokens: 0 },
        provider: "fake",
      }),
  };
}

const SUMMIT = "Trump, Putin and Xi hold trilateral summit in China";

describe("picking photos for stories", () => {
  it("looks near the pins first, then a small country", () => {
    const places = placesFor(story("a", 1, [24.75, 59.44]));
    expect(places.map((p) => p.name)).toEqual(["Tallinn", "Estonia"]);
    expect(places[0]?.radiusKm).toBe(12);
  });

  it("searches official photos by the people in the headline", () => {
    expect(eventTerms(story("a", 1, [0, 0], SUMMIT))).toEqual(["Trump", "Putin"]);
    expect(eventTerms(story("a", 1, [0, 0], "Floods hit Tallinn after storm"))).toEqual(["Floods"]);
  });

  it("keeps only what the AI says fits, and marks real event photos", async () => {
    const stories = new Map([
      ["a", story("a", 2, [24.75, 59.44], SUMMIT)],
      ["b", story("b", 1, [24.75, 59.44])],
    ]);
    const source: PhotoSource = {
      near: () => Promise.resolve([found(1), found(2)]),
      recent: () => Promise.resolve([found(9, "Putin, Xi and Trump at the summit", "2026-11-18")]),
    };
    const result = await addImages(stories, source, {
      llm: judge({ a: [{ p: "e1", showsEvent: true }], b: [] }),
    });
    const a = result.stories.get("a")?.images ?? [];
    expect(a.map((i) => [i.id, i.illustrative])).toEqual([["commons-9", false]]);
    // The AI found nothing fitting for b: no photo rather than a random one.
    expect(result.stories.get("b")?.images).toEqual([]);
    expect(result.eventPhotos).toBe(1);
  });

  it("never calls an old photo 'from the event', whatever the AI says", async () => {
    const stories = new Map([["a", story("a", 1, [0, 0], SUMMIT)]]);
    const source: PhotoSource = {
      near: () => Promise.resolve([]),
      recent: () => Promise.resolve([found(9, "Putin and Trump", "2026-11-17")]),
    };
    const old: PhotoSource = {
      ...source,
      recent: () => Promise.resolve([found(9, "Putin and Trump", "2019-06-28")]),
    };
    const fresh = await addImages(stories, source, { llm: judge({ a: [{ p: "e1", showsEvent: true }] }) });
    expect(fresh.stories.get("a")?.images[0]?.illustrative).toBe(false);
    // An old photo isn't even offered as an event photo.
    const stale = await addImages(stories, old, { llm: judge({ a: [{ p: "e1", showsEvent: true }] }) });
    expect(stale.stories.get("a")?.images).toEqual([]);
  });

  it("without the AI keeps only official photos naming the headline's people", async () => {
    const stories = new Map([["a", story("a", 1, [0, 0], SUMMIT)]]);
    const result = await addImages(stories, {
      near: () => Promise.resolve([found(1)]),
      recent: () => Promise.resolve([found(9, "Trump and Putin shake hands", "2026-11-19")]),
    });
    expect(result.stories.get("a")?.images.map((i) => [i.id, i.illustrative])).toEqual([["commons-9", true]]);
  });

  it("searches each place once and stops at the time limit", async () => {
    let calls = 0;
    const source: PhotoSource = {
      near: () => {
        calls++;
        return Promise.resolve([found(1)]);
      },
      recent: () => Promise.resolve([]),
    };
    const many = new Map(["a", "b", "c"].map((id, i) => [id, story(id, 3 - i, [24.75, 59.44])] as const));
    await addImages(many, source, { llm: judge({}) });
    expect(calls).toBe(2); // Tallinn and Estonia, shared by all three stories
    const late = await addImages(many, source, { deadline: 0 });
    expect(late.withImages).toBe(0);
  });
});
