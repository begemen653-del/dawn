import { describe, expect, it } from "vitest";
import { SAMPLE_EVENTS, SAMPLE_PLAYLISTS } from "../../../pipeline/fixtures/sample-brief";
import { buildChapters, buildSlides } from "./chapters";

const brief = {
  sample: true,
  events: new Map(SAMPLE_EVENTS.map((e) => [e.id, e])),
  playlists: Object.entries(SAMPLE_PLAYLISTS).map(([scope, eventIds]) => ({
    schemaVersion: 1 as const,
    date: "2026-11-02",
    scope,
    title: scope,
    eventIds: [...eventIds],
  })),
};

describe("buildChapters", () => {
  it("follows the user's order with Global last", () => {
    const chapters = buildChapters(["TR", "europe", "DE"], brief);
    expect(chapters.map((c) => c.scope)).toEqual(["TR", "europe", "DE", "global"]);
  });

  it("keeps empty chapters with an honest reason", () => {
    const [japan] = buildChapters(["JP"], brief);
    expect(japan?.stories).toHaveLength(0);
    expect(japan?.emptyReason).toContain("Japan");
  });

  it("produces one slide per story and one note per empty chapter", () => {
    const slides = buildSlides(buildChapters(["DE", "JP"], brief));
    // DE: 1 story, JP: empty note, Global: 2 stories
    expect(slides.map((s) => s.story?.id ?? "empty")).toEqual([
      "sample-berlin-overview",
      "empty",
      "sample-global-overview",
      "sample-berlin-overview",
    ]);
    expect(slides[3]).toMatchObject({ position: 1, chapterLength: 2 });
  });
});
