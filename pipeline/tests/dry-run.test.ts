import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDry } from "../src/run/dry";
import { DayIndex, EventStore, Playlist, RunStatus } from "../src/schema";

let outDir: string;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "dawn-dry-"));
});

afterEach(async () => {
  await rm(outDir, { recursive: true, force: true });
});

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(outDir, path), "utf8")) as unknown;
}

describe("dry run", () => {
  it("writes a valid, self-consistent brief", async () => {
    const { files } = await runDry({ outDir, now: new Date("2026-11-02T03:30:00Z") });

    const index = DayIndex.parse(await readJson("latest/index.json"));
    const store = EventStore.parse(await readJson("latest/events.json"));
    RunStatus.parse(await readJson("status.json"));

    expect(index.date).toBe("2026-11-02");
    expect(index.sample).toBe(true);
    expect(files).toContain("status.json");

    const eventIds = new Set(store.events.map((e) => e.id));
    for (const { file, count } of index.scopes) {
      const playlist = Playlist.parse(await readJson(`latest/${file}`));
      expect(playlist.eventIds).toHaveLength(count);
      for (const id of playlist.eventIds) expect(eventIds.has(id)).toBe(true);
    }
  });

  it("is idempotent", async () => {
    const now = new Date("2026-11-02T03:30:00Z");
    await runDry({ outDir, now });
    const first = await readJson("latest/events.json");
    await runDry({ outDir, now });
    expect(await readJson("latest/events.json")).toEqual(first);
  });
});
