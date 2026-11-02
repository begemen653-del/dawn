import { DayIndex, EventStore, Playlist, type StoryEvent } from "@dawn/pipeline/schema";
import type { z } from "zod";

export interface LoadedBrief {
  readonly index: DayIndex;
  readonly events: ReadonlyMap<string, StoryEvent>;
  readonly playlists: readonly Playlist[];
}

export class BriefLoadError extends Error {
  constructor(
    message: string,
    readonly reason: "offline" | "missing" | "invalid",
  ) {
    super(message);
    this.name = "BriefLoadError";
  }
}

async function fetchJson<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { signal: signal ?? null, cache: "no-cache" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BriefLoadError("You seem to be offline, and no brief is saved yet.", "offline");
  }
  if (!res.ok) throw new BriefLoadError("Today's brief isn't available yet.", "missing");
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success)
    throw new BriefLoadError("Today's brief looks damaged. Please try again later.", "invalid");
  return parsed.data;
}

/** Loads and validates the latest brief written by the pipeline. */
export async function loadLatestBrief(signal?: AbortSignal): Promise<LoadedBrief> {
  const [index, store] = await Promise.all([
    fetchJson("/data/latest/index.json", DayIndex, signal),
    fetchJson("/data/latest/events.json", EventStore, signal),
  ]);
  const playlists = await Promise.all(
    index.scopes.map((s) => fetchJson(`/data/latest/${s.file}`, Playlist, signal)),
  );
  return { index, events: new Map(store.events.map((e) => [e.id, e])), playlists };
}
