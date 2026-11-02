import { DayIndex, EventStore, Playlist, type StoryEvent } from "@dawn/pipeline/schema";
import type { z } from "zod";

export interface LoadedBrief {
  readonly index: DayIndex;
  readonly events: ReadonlyMap<string, StoryEvent>;
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

/** Loads and validates the latest brief written by the pipeline (index and stories). */
export async function loadLatestBrief(signal?: AbortSignal): Promise<LoadedBrief> {
  const [index, store] = await Promise.all([
    fetchJson("/data/latest/index.json", DayIndex, signal),
    fetchJson("/data/latest/events.json", EventStore, signal),
  ]);
  return { index, events: new Map(store.events.map((e) => [e.id, e])) };
}

/**
 * Loads only the chapters the reader chose (the brief has one file per region and country).
 * A chapter that fails to load is skipped; it then shows as having no stories.
 */
export async function loadPlaylists(
  index: DayIndex,
  scopes: readonly string[],
  signal?: AbortSignal,
): Promise<Playlist[]> {
  const files = index.scopes.filter((s) => scopes.includes(s.scope));
  const results = await Promise.allSettled(
    files.map((s) => fetchJson(`/data/latest/${s.file}`, Playlist, signal)),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}
