import { describe, expect, it } from "vitest";
import { SAMPLE_EVENTS } from "../fixtures/sample-brief";
import { ImageAsset, Playlist, StoryEvent } from "../src/schema";

const sample = SAMPLE_EVENTS[0];
if (!sample) throw new Error("fixture missing");

describe("StoryEvent", () => {
  it("accepts the sample fixtures", () => {
    for (const event of SAMPLE_EVENTS) expect(StoryEvent.safeParse(event).success).toBe(true);
  });

  it("requires at least two sources", () => {
    const result = StoryEvent.safeParse({ ...sample, sources: sample.sources.slice(0, 1) });
    expect(result.success).toBe(false);
  });

  it("requires the AI-generated label", () => {
    expect(StoryEvent.safeParse({ ...sample, aiGenerated: false }).success).toBe(false);
  });

  it("rejects non-http source links", () => {
    const first = sample.sources[0];
    if (!first) throw new Error("fixture missing");
    const sources = [{ ...first, url: "javascript:alert(1)" }, ...sample.sources.slice(1)];
    expect(StoryEvent.safeParse({ ...sample, sources }).success).toBe(false);
  });
});

describe("Playlist", () => {
  const base = { schemaVersion: 1, date: "2026-11-02", scope: "DE", title: "Germany" };

  it("accepts a country or region scope", () => {
    expect(Playlist.safeParse({ ...base, eventIds: ["a"] }).success).toBe(true);
    expect(Playlist.safeParse({ ...base, scope: "europe", eventIds: ["a"] }).success).toBe(true);
  });

  it("rejects unknown scopes", () => {
    expect(Playlist.safeParse({ ...base, scope: "mars", eventIds: ["a"] }).success).toBe(false);
  });

  it("needs a reason when empty", () => {
    expect(Playlist.safeParse({ ...base, eventIds: [] }).success).toBe(false);
    expect(Playlist.safeParse({ ...base, eventIds: [], emptyReason: "Quiet news day." }).success).toBe(true);
  });

  it("caps chapters at 8 stories", () => {
    const eventIds = Array.from({ length: 9 }, (_, i) => `e${i}`);
    expect(Playlist.safeParse({ ...base, eventIds }).success).toBe(false);
  });
});

describe("ImageAsset", () => {
  const image = {
    id: "commons-1",
    kind: "photo",
    thumbUrl: "https://upload.wikimedia.org/thumb.jpg",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
    provider: "wikimedia-commons",
    author: "Jane Doe",
    license: { id: "cc-by-sa", name: "CC BY-SA 4.0" },
    alt: "A city street",
    illustrative: true,
  };

  it("accepts an allowed license", () => {
    expect(ImageAsset.safeParse(image).success).toBe(true);
  });

  it("rejects licenses outside the allowlist", () => {
    expect(ImageAsset.safeParse({ ...image, license: { id: "cc-by-nc", name: "CC BY-NC" } }).success).toBe(
      false,
    );
  });

  it("rejects providers outside the allowlist", () => {
    expect(ImageAsset.safeParse({ ...image, provider: "reuters" }).success).toBe(false);
  });
});
