import { describe, expect, it } from "vitest";
import { isSameStory, mergeDuplicates } from "../src/run/dedupe";
import type { StoryEvent } from "../src/schema";

const story = (
  id: string,
  headline: string,
  summary: string,
  countries: string[],
  importance = 50,
  urls: string[] = [`https://a.example/${id}`, `https://b.example/${id}`],
): StoryEvent =>
  ({
    id,
    headline,
    summary,
    countries,
    importance,
    sources: urls.map((url) => ({
      outlet: "X",
      title: headline,
      url,
      publishedAt: "2026-11-12T10:00:00.000Z",
    })),
  }) as unknown as StoryEvent;

// Real pairs from the 2026-11-12 brief.
const nvidiaA = story(
  "ev-nvidia-a",
  "Nvidia CEO Jensen Huang resigns amid scandal",
  "Nvidia CEO Jensen Huang has resigned following reports of extramarital affairs. Chief financial officer Colette Kress will serve as interim CEO.",
  ["US"],
  80,
);
const nvidiaB = story(
  "ev-nvidia-b",
  "Nvidia CEO Jensen Huang resigns following scandals",
  "Jensen Huang stepped down as chief executive of Nvidia after reports about his private life. Colette Kress becomes interim CEO.",
  ["US", "CN"],
  60,
);
const collapseUs = story(
  "ev-brooklyn",
  "Eight dead following building collapse in Brooklyn",
  "A residential building collapsed in Brooklyn, killing eight people. Rescue crews searched the rubble overnight.",
  ["US"],
);
const ghanaQualifier = story(
  "ev-ghana-afcon",
  "Ghana prepares for AFCON qualifier against Somalia",
  "Ghana's national team is training for its Africa Cup of Nations qualifier against Somalia this weekend.",
  ["GH"],
);
const ghanaU23 = story(
  "ev-ghana-u23",
  "Libya defeats Ghana 1-0 in U-23 Africa Cup of Nations qualifier",
  "Libya beat Ghana 1-0 in an under-23 Africa Cup of Nations qualifier, putting Ghana's hopes at risk.",
  ["GH", "LY"],
);

describe("duplicate stories", () => {
  it("spots the same news written twice", () => {
    expect(isSameStory(nvidiaA, nvidiaB)).toBe(true);
  });

  it("keeps different news apart, even when it sounds alike", () => {
    expect(isSameStory(nvidiaA, collapseUs)).toBe(false);
    expect(isSameStory(ghanaQualifier, ghanaU23)).toBe(false);
  });

  it("keeps the more important story, adds the repeat's sources, removes it from chapters", () => {
    const stories = new Map([nvidiaB, nvidiaA, collapseUs].map((s) => [s.id, s]));
    const chapters = [
      { scope: "US", title: "United States", eventIds: ["ev-nvidia-b", "ev-brooklyn", "ev-nvidia-a"] },
      { scope: "global", title: "Global", eventIds: ["ev-nvidia-b"] },
    ];
    const out = mergeDuplicates(chapters, stories);
    expect(out.merged).toBe(1);
    expect([...out.stories.keys()].sort()).toEqual(["ev-brooklyn", "ev-nvidia-a"]);
    expect(out.stories.get("ev-nvidia-a")?.sources).toHaveLength(4);
    expect(out.chapters[0]?.eventIds).toEqual(["ev-nvidia-a", "ev-brooklyn"]);
    expect(out.chapters[1]?.eventIds).toEqual(["ev-nvidia-a"]);
  });
});
