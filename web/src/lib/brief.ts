import { DayIndex, EventStore, Playlist, type StoryEvent } from "@dawn/pipeline/schema";
import type { z } from "zod";

/**
 * Loading and saving the brief.
 *
 * The brief (about 1.5 MB of JSON) is kept in the browser's Cache Storage, separate from the app
 * itself, so the app opens instantly and works offline:
 * - each brief is saved in its own cache, named after the time it was generated;
 * - index.json is written last, so a cache without it is an unfinished download and is ignored;
 * - once a new brief is fully saved, older ones are deleted (only one day is ever kept).
 */

const DATA = "/data/latest";
const CACHE_PREFIX = "dawn-brief:";
const DOWNLOADS_AT_ONCE = 6;

export interface LoadedBrief {
  readonly index: DayIndex;
  readonly events: ReadonlyMap<string, StoryEvent>;
  /** The saved copy this brief lives in, or null when it came straight from the network. */
  readonly cacheName: string | null;
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

/** Cache Storage only exists on https and localhost (not on http://192.168…, for example). */
function storage(): CacheStorage | null {
  return typeof caches === "undefined" ? null : caches;
}

async function fetchResponse(path: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { signal: signal ?? null, cache: "no-store" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BriefLoadError("You seem to be offline, and no brief is saved yet.", "offline");
  }
  if (!res.ok) throw new BriefLoadError("Today's brief isn't available yet.", "missing");
  return res;
}

async function parse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success)
    throw new BriefLoadError("Today's brief looks damaged. Please try again later.", "invalid");
  return parsed.data;
}

function toBrief(index: DayIndex, store: EventStore, cacheName: string | null): LoadedBrief {
  return { index, events: new Map(store.events.map((e) => [e.id, e])), cacheName };
}

/** Names of saved, complete briefs, newest first. */
async function savedNames(cs: CacheStorage): Promise<string[]> {
  const names = (await cs.keys())
    .filter((n) => n.startsWith(CACHE_PREFIX))
    .sort()
    .reverse();
  const complete: string[] = [];
  for (const name of names) {
    if (await (await cs.open(name)).match(`${DATA}/index.json`)) complete.push(name);
  }
  return complete;
}

/** The brief saved on this device, if any. Never touches the network. */
export async function readSavedBrief(): Promise<LoadedBrief | null> {
  const cs = storage();
  if (!cs) return null;
  try {
    for (const name of await savedNames(cs)) {
      const cache = await cs.open(name);
      const [indexRes, eventsRes] = await Promise.all([
        cache.match(`${DATA}/index.json`),
        cache.match(`${DATA}/events.json`),
      ]);
      if (!indexRes || !eventsRes) continue;
      try {
        return toBrief(await parse(indexRes, DayIndex), await parse(eventsRes, EventStore), name);
      } catch {
        // A damaged copy: try an older one.
      }
    }
  } catch {
    // Storage blocked or full: behave as if nothing is saved.
  }
  return null;
}

export interface DownloadCallbacks {
  /** Called as soon as the new brief can be shown, before every chapter is saved. */
  readonly onReady?: (brief: LoadedBrief) => void;
}

/**
 * Checks the network for a brief newer than `current`. Returns null when `current` is still the
 * latest; otherwise downloads the whole brief, saves it, deletes older copies and returns it.
 */
export async function downloadBrief(
  current: DayIndex | null,
  signal?: AbortSignal,
  callbacks: DownloadCallbacks = {},
): Promise<LoadedBrief | null> {
  const indexRes = await fetchResponse(`${DATA}/index.json`, signal);
  const indexCopy = indexRes.clone();
  const index = await parse(indexRes, DayIndex);
  if (current?.generatedAt === index.generatedAt) return null;

  const eventsRes = await fetchResponse(`${DATA}/events.json`, signal);
  const eventsCopy = eventsRes.clone();
  const fresh = toBrief(index, await parse(eventsRes, EventStore), null);
  callbacks.onReady?.(fresh);

  const cs = storage();
  if (!cs) return fresh;
  const name = `${CACHE_PREFIX}${index.generatedAt}`;
  try {
    const cache = await cs.open(name);
    await cache.put(`${DATA}/events.json`, eventsCopy);
    const files = index.scopes.map((s) => `${DATA}/${s.file}`);
    let next = 0;
    await Promise.all(
      Array.from({ length: DOWNLOADS_AT_ONCE }, async () => {
        while (next < files.length) {
          const path = files[next++];
          if (path) await cache.put(path, await fetchResponse(path, signal));
        }
      }),
    );
    // Written last: marks this copy as complete.
    await cache.put(`${DATA}/index.json`, indexCopy);
    for (const old of await cs.keys()) {
      if (old.startsWith(CACHE_PREFIX) && old !== name) await cs.delete(old);
    }
    return { ...fresh, cacheName: name };
  } catch (error) {
    // Couldn't save (offline halfway, storage full): drop the unfinished copy; the brief still
    // works while online, and the next check tries again.
    await cs.delete(name).catch(() => false);
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return fresh;
  }
}

/**
 * Loads only the chapters the reader chose (the brief has one file per region and country), from
 * the saved copy when there is one. A chapter that fails to load is skipped; it then shows as
 * having no stories.
 */
export async function loadPlaylists(
  brief: LoadedBrief,
  scopes: readonly string[],
  signal?: AbortSignal,
): Promise<Playlist[]> {
  const cs = storage();
  const cache = brief.cacheName && cs ? await cs.open(brief.cacheName).catch(() => null) : null;
  const files = brief.index.scopes.filter((s) => scopes.includes(s.scope));
  const results = await Promise.allSettled(
    files.map(async (s) => {
      const path = `${DATA}/${s.file}`;
      const res = (await cache?.match(path)) ?? (await fetchResponse(path, signal));
      return parse(res, Playlist);
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * When the brief was made, in the reader's own time: "Today, 04:31", "Yesterday, 04:31" or
 * "11 Nov, 04:31". `fresh` is false from the day after, so the app can say the brief is old.
 */
export function briefAge(generatedAt: string, now: Date = new Date()): { label: string; fresh: boolean } {
  const made = new Date(generatedAt);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const time = timeFormat.format(made);
  if (dayKey(made) === dayKey(now)) return { label: `Today, ${time}`, fresh: true };
  if (dayKey(made) === dayKey(yesterday)) return { label: `Yesterday, ${time}`, fresh: false };
  return { label: `${dayFormat.format(made)}, ${time}`, fresh: false };
}
