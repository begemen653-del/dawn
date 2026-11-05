import { getCountry, isRegion } from "@dawn/config";
import { join } from "node:path";
import { writeLearnCard } from "../ai/learn";
import type { LlmProvider } from "../ai/provider";
import { DEFAULT_SUMMARIZE, summarizeEvents } from "../ai/summarize";
import type { ChapterPlan } from "../events/assign";
import type { EventCluster } from "../events/types";
import {
  DayIndex,
  EventStore,
  Playlist,
  RunStatus,
  SCHEMA_VERSION,
  type DayIndex as DayIndexType,
  type StoryEvent,
} from "../schema";
import { readArticle } from "../sources/article-text";
import { PoliteFetcher } from "../sources/http";
import { writeJson } from "./write";

export interface BriefOptions {
  readonly events: readonly EventCluster[];
  readonly chapters: readonly ChapterPlan[];
  readonly llm: LlmProvider;
  /** web/public/data */
  readonly outDir: string;
  readonly cacheDir: string;
  readonly now?: Date;
  /** Read article texts for the AI (off in tests). */
  readonly readTexts?: boolean;
  /** Only the N most important events (for quick trials); default: all. */
  readonly maxEvents?: number;
  /** Below this many stories the old brief is kept. */
  readonly minStories?: number;
  readonly log?: (message: string) => void;
}

export interface BriefResult {
  readonly status: RunStatus;
  readonly published: boolean;
  readonly stories: readonly StoryEvent[];
}

const TOP_PER_TIER1_COUNTRY_DEEP = 3;

function berlinDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

/** Most-viewed chapters first: Global, regions, big countries, then everyone else. */
function priorityOrder(chapters: readonly ChapterPlan[]): string[] {
  const rank = (scope: string) =>
    scope === "global" ? 0 : isRegion(scope) ? 1 : getCountry(scope)?.tier === 1 ? 2 : 3;
  const ordered = [...chapters].sort((a, b) => rank(a.scope) - rank(b.scope));
  return [...new Set(ordered.flatMap((c) => c.eventIds))];
}

/** Events that get pre-written "Go deeper": Global, regions and the top of big-country chapters. */
function deepSet(chapters: readonly ChapterPlan[]): Set<string> {
  const deep = new Set<string>();
  for (const c of chapters) {
    if (c.scope === "global" || isRegion(c.scope)) c.eventIds.forEach((id) => deep.add(id));
    else if (getCountry(c.scope)?.tier === 1)
      c.eventIds.slice(0, TOP_PER_TIER1_COUNTRY_DEEP).forEach((id) => deep.add(id));
  }
  return deep;
}

async function readTexts(
  events: readonly EventCluster[],
  cacheDir: string,
  log: (m: string) => void,
): Promise<Map<string, string>> {
  const fetcher = new PoliteFetcher({ cacheDir: join(cacheDir, "http") });
  const urls: string[] = [];
  for (const e of events) {
    const seen = new Set<string>();
    const picks = [...e.articles]
      .sort(
        (a, b) =>
          Number(b.curated) - Number(a.curated) || Number(b.language === "en") - Number(a.language === "en"),
      )
      .filter((a) => (seen.has(a.outlet) ? false : (seen.add(a.outlet), true)))
      .slice(0, 3);
    urls.push(...picks.map((a) => a.url));
  }
  const texts = new Map<string, string>();
  let next = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        if (!url) continue;
        const text = await readArticle(url, fetcher);
        if (text) texts.set(url, text);
      }
    }),
  );
  log(`Read ${texts.size} of ${urls.length} articles in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  return texts;
}

/**
 * Keeps only events that became stories, and only where the AI confirmed the story is really
 * about that place: a country chapter needs the country in the story's countries, a region
 * chapter needs one of them to be in the region.
 */
export function finalChapters(
  chapters: readonly ChapterPlan[],
  stories: ReadonlyMap<string, StoryEvent>,
): ChapterPlan[] {
  return chapters.map((c) => {
    const kept = c.eventIds.filter((id) => {
      const s = stories.get(id);
      if (!s) return false;
      if (c.scope === "global") return true;
      if (isRegion(c.scope)) {
        return s.countries.length === 0 || s.countries.some((iso2) => getCountry(iso2)?.region === c.scope);
      }
      return s.countries.includes(c.scope);
    });
    return kept.length > 0
      ? { scope: c.scope, title: c.title, eventIds: kept }
      : {
          scope: c.scope,
          title: c.title,
          eventIds: [],
          emptyReason: c.emptyReason ?? `Almost no news about ${c.title} in the last 24 hours.`,
        };
  });
}

/** Groups a drop reason into a short, readable kind for the run status. */
export function dropKind(reason: string): string {
  if (reason === "not a clear news event") return "not news";
  if (/number|quote|name|date/i.test(reason) && /not (found|in)|unknown|invented/i.test(reason))
    return "failed the fact check";
  if (/place|source|invalid story/i.test(reason)) return "incomplete";
  if (/JSON|schema|empty reply|no answer|missing/i.test(reason)) return "bad AI format";
  if (/quota|HTTP|too big|timeout|abort|fetch/i.test(reason)) return "AI unavailable";
  return "other";
}

/**
 * Milestone 4: turns ingested events into the app's brief with AI, then publishes it to
 * web/public/data/latest. If too few stories come out, the previous brief stays in place.
 */
export async function runBrief(options: BriefOptions): Promise<BriefResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => undefined);
  const startedAt = new Date().toISOString();
  const date = berlinDate(now);
  const warnings: string[] = [];

  const order = priorityOrder(options.chapters);
  const byId = new Map(options.events.map((e) => [e.id, e]));
  const events = order.flatMap((id) => byId.get(id) ?? []).slice(0, options.maxEvents ?? Infinity);
  const texts =
    options.readTexts === false ? new Map<string, string>() : await readTexts(events, options.cacheDir, log);

  const { stories, dropped, budgetHit } = await summarizeEvents(events, options.llm, {
    ...DEFAULT_SUMMARIZE,
    deep: deepSet(options.chapters),
    texts,
    log,
  });
  if (budgetHit) warnings.push("AI budget reached: some lower-priority chapters have fewer stories today.");
  for (const d of dropped) log(`Dropped ${d.id}: ${d.reason}`);
  if (dropped.length > 0) {
    const counts = new Map<string, number>();
    for (const d of dropped) counts.set(dropKind(d.reason), (counts.get(dropKind(d.reason)) ?? 0) + 1);
    const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${n} ${kind}`);
    warnings.push(`${dropped.length} events dropped: ${parts.join(", ")}.`);
  }
  log(`AI wrote ${stories.size} stories; ${dropped.length} dropped${budgetHit ? "; budget reached" : ""}`);

  const chapters = finalChapters(options.chapters, stories);
  const used = new Set(chapters.flatMap((c) => c.eventIds));
  const published = [...stories.values()]
    .filter((s) => used.has(s.id))
    .sort((a, b) => b.importance - a.importance);
  const minStories = options.minStories ?? 10;

  const status: RunStatus = {
    schemaVersion: SCHEMA_VERSION,
    ok: published.length >= minStories,
    mode: "live",
    date,
    startedAt,
    finishedAt: new Date().toISOString(),
    counts: {
      articles: events.reduce((n, e) => n + e.articles.length, 0),
      events: published.length,
      playlists: chapters.length,
    },
    warnings,
    errors:
      published.length >= minStories ? [] : [`Only ${published.length} stories; kept the previous brief.`],
  };
  await writeJson(join(options.outDir, "status.json"), RunStatus, status);
  if (!status.ok) return { status, published: false, stories: published };

  const global = chapters.find((c) => c.scope === "global");
  const top = (global?.eventIds ?? []).flatMap((id) => stories.get(id) ?? []);
  const learn = await writeLearnCard(top.length > 0 ? top : published.slice(0, 6), options.llm);

  // Write stories and chapters first and the index last, so the app never sees an index that
  // points to files that aren't there yet.
  const latest = join(options.outDir, "latest");
  await writeJson(join(latest, "events.json"), EventStore, {
    schemaVersion: SCHEMA_VERSION,
    date,
    generatedAt: startedAt,
    events: published,
  });
  const scopes: DayIndexType["scopes"] = [];
  for (const c of chapters) {
    const file = `playlists/${c.scope}.json`;
    await writeJson(join(latest, file), Playlist, {
      schemaVersion: SCHEMA_VERSION,
      date,
      scope: c.scope,
      title: c.title,
      eventIds: [...c.eventIds],
      ...(c.emptyReason ? { emptyReason: c.emptyReason } : {}),
    });
    scopes.push({ scope: c.scope, file, count: c.eventIds.length });
  }
  await writeJson(join(latest, "index.json"), DayIndex, {
    schemaVersion: SCHEMA_VERSION,
    date,
    generatedAt: startedAt,
    sample: false,
    scopes,
    learn,
  });
  return { status, published: true, stories: published };
}
