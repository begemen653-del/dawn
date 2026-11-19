import { describe, expect, it } from "vitest";
import type { ChapterPlan } from "../src/events/assign";
import type { EventCluster } from "../src/events/types";
import { mergeUpdate, pickCandidates, windowSince } from "../src/run/evening";
import type { StoryEvent } from "../src/schema";

const story = (
  id: string,
  headline: string,
  countries: string[],
  importance = 50,
  urls?: string[],
): StoryEvent =>
  ({
    id,
    headline,
    summary: headline,
    countries,
    importance,
    sources: (urls ?? [`https://a.example/${id}`, `https://b.example/${id}`]).map((url) => ({
      outlet: "X",
      title: headline,
      url,
      publishedAt: "2026-11-19T10:00:00.000Z",
    })),
  }) as unknown as StoryEvent;

const cluster = (id: string, urls: string[]): EventCluster =>
  ({ id, articles: urls.map((url) => ({ url })) }) as unknown as EventCluster;

const chapter = (scope: string, eventIds: string[]): ChapterPlan => ({ scope, title: scope, eventIds });

describe("evening update", () => {
  it("reads the news since the morning brief, between 4 and 18 hours", () => {
    const now = new Date("2026-11-19T17:00:00.000Z");
    expect(windowSince("2026-11-19T04:30:00.000Z", now)).toBe(13);
    expect(windowSince("2026-11-19T15:00:00.000Z", now)).toBe(4);
    expect(windowSince("2026-11-18T04:30:00.000Z", now)).toBe(18);
  });

  it("skips events already covered in the morning and minor chapters", () => {
    const morning = [
      story("m1", "Summit in Beijing", ["CN"], 80, ["https://bbc.co.uk/summit", "https://x.com/a"]),
    ];
    const events = [
      cluster("e-old", ["https://www.bbc.co.uk/summit/"]),
      cluster("e-new", ["https://dw.com/quake"]),
      cluster("e-minor", ["https://local.example/fair"]),
    ];
    const chapters = [chapter("global", ["e-old", "e-new"]), chapter("TV", ["e-minor"])];
    expect(pickCandidates(events, chapters, morning).map((e) => e.id)).toEqual(["e-new"]);
  });

  it("puts new stories first, drops repeats and keeps chapters at 8", () => {
    const morningStories = new Map(
      Array.from({ length: 8 }, (_, i) => {
        const s = story(`m${i}`, `Morning story number ${i} about topic ${i}`, ["DE"], 60 - i);
        return [s.id, s] as const;
      }),
    );
    const morning = {
      chapters: [chapter("global", [...morningStories.keys()]), chapter("DE", ["m0"])],
      stories: morningStories,
    };
    const quake = story("e-quake", "Strong earthquake hits southern Turkey", ["TR"], 90);
    const repeat = story("e-repeat", "Morning story number 0 about topic 0", ["DE"], 70);
    const evening = {
      chapters: [chapter("global", ["e-quake", "e-repeat"]), chapter("TR", ["e-quake"])],
      stories: new Map([
        [quake.id, quake],
        [repeat.id, repeat],
      ]),
    };
    const out = mergeUpdate(morning, evening);
    expect(out.added).toEqual(["e-quake"]);
    const global = out.chapters.find((c) => c.scope === "global");
    expect(global?.eventIds[0]).toBe("e-quake");
    expect(global?.eventIds).toHaveLength(8);
    expect(global?.eventIds).not.toContain("e-repeat");
    // The new country chapter appears; the last morning story made room but is kept where still used.
    expect(out.chapters.find((c) => c.scope === "TR")?.eventIds).toEqual(["e-quake"]);
    expect(out.stories.has("m7")).toBe(false);
    expect(out.stories.has("m0")).toBe(true);
  });

  it("changes nothing when every evening story repeats the morning", () => {
    const m = story("m1", "Strong earthquake hits southern Turkey", ["TR"]);
    const e = story("e1", "Strong earthquake hits southern Turkey", ["TR"]);
    const out = mergeUpdate(
      { chapters: [chapter("global", ["m1"])], stories: new Map([[m.id, m]]) },
      { chapters: [chapter("global", ["e1"])], stories: new Map([[e.id, e]]) },
    );
    expect(out.added).toEqual([]);
    expect(out.chapters[0]?.eventIds).toEqual(["m1"]);
  });
});
