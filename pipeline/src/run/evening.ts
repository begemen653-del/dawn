import { getCountry, isRegion } from "@dawn/config";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { LlmProvider } from "../ai/provider";
import { DEFAULT_SUMMARIZE, summarizeEvents } from "../ai/summarize";
import type { ChapterPlan } from "../events/assign";
import { canonicalUrl } from "../events/text";
import type { EventCluster } from "../events/types";
import { addImages, type PhotoSource } from "../images/pick";
import {
  DayIndex,
  EventStore,
  Playlist,
  RunStatus,
  SCHEMA_VERSION,
  type DayIndex as DayIndexType,
  type StoryEvent,
} from "../schema";
import { deepSet, finalChapters, priorityOrder, readTexts } from "./brief";
import { isSameStory, mergeDuplicates } from "./dedupe";
import { writeJson } from "./write";

/**
 * The evening update: a small second run (around 18:00 Berlin) that adds the biggest new stories
 * since the morning brief, at the top of their chapters. It writes only a handful of stories, so it
 * stays well inside the free AI allowance that the morning brief mostly uses.
 */

/** Chapters keep at most this many stories (the app's limit). */
const CHAPTER_CAP = 8;
/** New stories written per evening; a few more candidates are tried, as some are dropped or repeats. */
export const EVENING_NEW_STORIES = 10;
const EVENING_CANDIDATES = 16;

export interface SavedBrief {
  readonly index: DayIndexType;
  readonly stories: ReadonlyMap<string, StoryEvent>;
  readonly chapters: readonly ChapterPlan[];
}

/** Reads the published brief from web/public/data/latest (null if it isn't there or is damaged). */
export async function loadBrief(latestDir: string): Promise<SavedBrief | null> {
  try {
    const read = async (file: string) => JSON.parse(await readFile(join(latestDir, file), "utf8")) as unknown;
    const index = DayIndex.parse(await read("index.json"));
    const store = EventStore.parse(await read("events.json"));
    const chapters: ChapterPlan[] = [];
    for (const s of index.scopes) {
      const p = Playlist.parse(await read(s.file));
      chapters.push({
        scope: p.scope,
        title: p.title,
        eventIds: p.eventIds,
        ...(p.emptyReason ? { emptyReason: p.emptyReason } : {}),
      });
    }
    return { index, stories: new Map(store.events.map((e) => [e.id, e])), chapters };
  } catch {
    return null;
  }
}

/** Hours of news to read: everything since the morning brief was made (4 to 18 hours). */
export function windowSince(generatedAt: string, now: Date): number {
  const hours = (now.getTime() - Date.parse(generatedAt)) / 3_600_000;
  return Math.min(18, Math.max(4, Number.isFinite(hours) ? Math.ceil(hours) : 12));
}

/** Only the most-read chapters choose evening stories: Global, the regions and the big countries. */
function isMainChapter(scope: string): boolean {
  return scope === "global" || isRegion(scope) || getCountry(scope)?.tier === 1;
}

/**
 * The events worth writing tonight: most important first (same order as the morning), skipping
 * any whose articles were already sources of a morning story (that news is already in the brief).
 */
export function pickCandidates(
  events: readonly EventCluster[],
  chapters: readonly ChapterPlan[],
  existing: Iterable<StoryEvent>,
  max = EVENING_CANDIDATES,
): EventCluster[] {
  const known = new Set<string>();
  for (const s of existing) for (const src of s.sources) known.add(canonicalUrl(src.url) ?? src.url);
  const byId = new Map(events.map((e) => [e.id, e]));
  const out: EventCluster[] = [];
  for (const id of priorityOrder(chapters.filter((c) => isMainChapter(c.scope)))) {
    const e = byId.get(id);
    if (!e) continue;
    if (e.articles.some((a) => known.has(canonicalUrl(a.url) ?? a.url))) continue;
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Adds tonight's stories to the morning brief: repeats of morning stories are left out, new
 * stories go to the top of their chapters (at most `maxNew` of them), and each chapter keeps its
 * limit of 8 by letting its last morning stories go.
 */
export function mergeUpdate(
  morning: { readonly chapters: readonly ChapterPlan[]; readonly stories: ReadonlyMap<string, StoryEvent> },
  evening: { readonly chapters: readonly ChapterPlan[]; readonly stories: ReadonlyMap<string, StoryEvent> },
  maxNew = EVENING_NEW_STORIES,
): { chapters: ChapterPlan[]; stories: Map<string, StoryEvent>; added: string[] } {
  const old = [...morning.stories.values()];
  const fresh = [...evening.stories.values()]
    .filter((s) => !morning.stories.has(s.id) && !old.some((o) => isSameStory(o, s)))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, maxNew);
  const freshIds = new Set(fresh.map((s) => s.id));

  const eveningByScope = new Map(evening.chapters.map((c) => [c.scope, c]));
  const merge = (c: ChapterPlan): ChapterPlan => {
    const added = (eveningByScope.get(c.scope)?.eventIds ?? []).filter((id) => freshIds.has(id));
    const eventIds = [...new Set([...added, ...c.eventIds])].slice(0, CHAPTER_CAP);
    if (eventIds.length === 0) return c;
    return { scope: c.scope, title: c.title, eventIds };
  };
  const chapters = morning.chapters.map(merge);
  const known = new Set(morning.chapters.map((c) => c.scope));
  for (const c of evening.chapters)
    if (!known.has(c.scope)) {
      const eventIds = c.eventIds.filter((id) => freshIds.has(id)).slice(0, CHAPTER_CAP);
      if (eventIds.length > 0) chapters.push({ scope: c.scope, title: c.title, eventIds });
    }

  const used = new Set(chapters.flatMap((c) => c.eventIds));
  const stories = new Map<string, StoryEvent>();
  for (const s of [...fresh, ...old]) if (used.has(s.id)) stories.set(s.id, s);
  return { chapters, stories, added: fresh.map((s) => s.id).filter((id) => used.has(id)) };
}

export interface EveningOptions {
  readonly events: readonly EventCluster[];
  readonly chapters: readonly ChapterPlan[];
  readonly morning: SavedBrief;
  readonly llm: LlmProvider;
  /** web/public/data */
  readonly outDir: string;
  readonly cacheDir: string;
  readonly readTexts?: boolean;
  readonly deadline?: number;
  readonly images?: PhotoSource;
  readonly imageTimeMs?: number;
  readonly log?: (message: string) => void;
}

export interface EveningResult {
  readonly added: number;
  readonly published: boolean;
  readonly status: RunStatus | null;
}

/** Writes the evening stories and adds them to today's brief (nothing changes if none are new). */
export async function runEvening(options: EveningOptions): Promise<EveningResult> {
  const log = options.log ?? (() => undefined);
  const startedAt = new Date().toISOString();
  const { morning } = options;

  const candidates = pickCandidates(options.events, options.chapters, morning.stories.values());
  log(`Evening update: ${candidates.length} new events to write`);
  if (candidates.length === 0) return { added: 0, published: false, status: null };

  const texts =
    options.readTexts === false
      ? new Map<string, string>()
      : await readTexts(candidates, options.cacheDir, log);
  const ids = new Set(candidates.map((e) => e.id));
  const plans = options.chapters.map((c) => ({ ...c, eventIds: c.eventIds.filter((id) => ids.has(id)) }));
  const { stories, dropped } = await summarizeEvents(candidates, options.llm, {
    ...DEFAULT_SUMMARIZE,
    ...(options.deadline === undefined ? {} : { deadline: options.deadline }),
    deep: deepSet(plans),
    texts,
    log,
  });
  for (const d of dropped) log(`Dropped ${d.id}: ${d.reason}`);
  const deduped = mergeDuplicates(plans, stories);
  const evening = { chapters: finalChapters(deduped.chapters, deduped.stories), stories: deduped.stories };

  const merged = mergeUpdate(morning, evening);
  log(`Evening update: ${stories.size} written, ${merged.added.length} new to the brief`);
  if (merged.added.length === 0) return { added: 0, published: false, status: null };

  let storyMap: Map<string, StoryEvent> = merged.stories;
  if (options.images) {
    const addedIds = new Set(merged.added);
    const fresh = new Map([...storyMap].filter(([id]) => addedIds.has(id)));
    const pictured = await addImages(fresh, options.images, {
      llm: options.llm,
      log,
      ...(options.imageTimeMs === undefined ? {} : { deadline: Date.now() + options.imageTimeMs }),
    });
    storyMap = new Map([...storyMap, ...pictured.stories]);
    log(`Photos: ${pictured.withImages} of ${fresh.size} new stories have licensed photos`);
  }

  const date = morning.index.date;
  const events = [...storyMap.values()].sort((a, b) => b.importance - a.importance);
  const latest = join(options.outDir, "latest");
  await writeJson(join(latest, "events.json"), EventStore, {
    schemaVersion: SCHEMA_VERSION,
    date,
    generatedAt: startedAt,
    events,
  });
  const scopes: DayIndexType["scopes"] = [];
  for (const c of merged.chapters) {
    const file = `playlists/${c.scope}.json`;
    await writeJson(join(latest, file), Playlist, {
      schemaVersion: SCHEMA_VERSION,
      date,
      scope: c.scope,
      title: c.title,
      eventIds: [...c.eventIds],
      ...(c.emptyReason && c.eventIds.length === 0 ? { emptyReason: c.emptyReason } : {}),
    });
    scopes.push({ scope: c.scope, file, count: c.eventIds.length });
  }
  // The index last: the app only sees the update once every file it points to is written.
  await writeJson(join(latest, "index.json"), DayIndex, {
    ...morning.index,
    generatedAt: startedAt,
    scopes,
  });
  const status: RunStatus = {
    schemaVersion: SCHEMA_VERSION,
    ok: true,
    mode: "live",
    date,
    startedAt,
    finishedAt: new Date().toISOString(),
    counts: {
      articles: candidates.reduce((n, e) => n + e.articles.length, 0),
      events: events.length,
      playlists: scopes.length,
    },
    warnings: [`Evening update: ${merged.added.length} new stories added.`],
    errors: [],
  };
  await writeJson(join(options.outDir, "status.json"), RunStatus, status);
  return { added: merged.added.length, published: true, status };
}
