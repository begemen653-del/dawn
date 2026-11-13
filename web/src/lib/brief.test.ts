import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_EVENTS, SAMPLE_LEARN } from "../../../pipeline/fixtures/sample-brief";
import { briefAge, downloadBrief, loadPlaylists, readSavedBrief } from "./brief";

/** A small in-memory stand-in for the browser's Cache Storage. */
class MemoryCache {
  readonly entries = new Map<string, Response>();
  match(path: string): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(path)?.clone());
  }
  put(path: string, res: Response): Promise<void> {
    this.entries.set(path, res);
    return Promise.resolve();
  }
}
class MemoryStorage {
  readonly caches = new Map<string, MemoryCache>();
  open(name: string): Promise<MemoryCache> {
    const cache = this.caches.get(name) ?? new MemoryCache();
    this.caches.set(name, cache);
    return Promise.resolve(cache);
  }
  keys(): Promise<string[]> {
    return Promise.resolve([...this.caches.keys()]);
  }
  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.caches.delete(name));
  }
}

/** The files the server has for one brief. */
function serverBrief(generatedAt: string, headline: string): Map<string, unknown> {
  const date = generatedAt.slice(0, 10);
  const event = { ...SAMPLE_EVENTS[0], headline };
  return new Map<string, unknown>([
    [
      "/data/latest/index.json",
      {
        schemaVersion: 1,
        date,
        generatedAt,
        sample: false,
        scopes: [
          { scope: "global", file: "playlists/global.json", count: 1 },
          { scope: "DE", file: "playlists/DE.json", count: 1 },
        ],
        learn: SAMPLE_LEARN,
      },
    ],
    ["/data/latest/events.json", { schemaVersion: 1, date, generatedAt, events: [event] }],
    ...["global", "DE"].map(
      (scope) =>
        [
          `/data/latest/playlists/${scope}.json`,
          { schemaVersion: 1, date, scope, title: scope, eventIds: [event.id] },
        ] as const,
    ),
  ]);
}

let storage: MemoryStorage;
let server: Map<string, unknown> | null;

beforeEach(() => {
  storage = new MemoryStorage();
  server = null;
  vi.stubGlobal("caches", storage);
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) => {
      if (!server) return Promise.reject(new TypeError("Failed to fetch"));
      const body = server.get(path);
      return Promise.resolve(
        body === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(body)),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("saved brief", () => {
  it("downloads, saves and then opens offline", async () => {
    server = serverBrief("2026-11-13T03:30:00.000Z", "Monday's news");
    const fresh = await downloadBrief(null);
    expect(fresh?.cacheName).toBe("dawn-brief:2026-11-13T03:30:00.000Z");

    server = null; // offline
    const saved = await readSavedBrief();
    expect(saved?.index.generatedAt).toBe("2026-11-13T03:30:00.000Z");
    expect([...(saved?.events.values() ?? [])][0]?.headline).toBe("Monday's news");
    const chapters = saved ? await loadPlaylists(saved, ["DE", "global"]) : [];
    expect(chapters.map((p) => p.scope).sort()).toEqual(["DE", "global"]);
  });

  it("does nothing when the saved brief is still the latest", async () => {
    server = serverBrief("2026-11-13T03:30:00.000Z", "Monday's news");
    const first = await downloadBrief(null);
    expect(await downloadBrief(first?.index ?? null)).toBeNull();
  });

  it("keeps only the newest brief", async () => {
    server = serverBrief("2026-11-13T03:30:00.000Z", "Monday's news");
    await downloadBrief(null);
    server = serverBrief("2026-11-14T03:30:00.000Z", "Tuesday's news");
    await downloadBrief(null);
    expect(await storage.keys()).toEqual(["dawn-brief:2026-11-14T03:30:00.000Z"]);
    expect([...((await readSavedBrief())?.events.values() ?? [])][0]?.headline).toBe("Tuesday's news");
  });

  it("ignores a download that stopped halfway and keeps the old brief", async () => {
    server = serverBrief("2026-11-13T03:30:00.000Z", "Monday's news");
    await downloadBrief(null);
    server = serverBrief("2026-11-14T03:30:00.000Z", "Tuesday's news");
    server.delete("/data/latest/playlists/DE.json"); // connection lost before this file
    const fresh = await downloadBrief(null);
    expect(fresh?.cacheName).toBeNull(); // shown while online, not saved
    expect((await readSavedBrief())?.index.generatedAt).toBe("2026-11-13T03:30:00.000Z");
  });

  it("explains when there is no connection and nothing saved", async () => {
    await expect(downloadBrief(null)).rejects.toThrow("offline");
    expect(await readSavedBrief()).toBeNull();
  });
});

describe("briefAge", () => {
  const now = new Date(2026, 10, 14, 8, 0);
  it("says today, yesterday or the date", () => {
    expect(briefAge(new Date(2026, 10, 14, 4, 31).toISOString(), now)).toEqual({
      label: "Today, 04:31",
      fresh: true,
    });
    expect(briefAge(new Date(2026, 10, 13, 4, 31).toISOString(), now)).toEqual({
      label: "Yesterday, 04:31",
      fresh: false,
    });
    expect(briefAge(new Date(2026, 10, 11, 4, 31).toISOString(), now).label).toBe("11 Nov, 04:31");
  });
});
