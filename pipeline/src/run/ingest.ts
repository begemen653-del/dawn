import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildChapters, type ChapterPlan } from "../events/assign";
import { clusterArticles, dedupe } from "../events/cluster";
import { scoreEvents } from "../events/rank";
import type { EventCluster } from "../events/types";
import { RunStatus, SCHEMA_VERSION, type Article } from "../schema";
import type { FetchContext, NewsSource } from "../sources/types";
import { writeJson } from "./write";

export interface IngestOptions {
  readonly sources: readonly NewsSource[];
  readonly outDir: string;
  readonly cacheDir: string;
  readonly now?: Date;
  readonly windowHours?: number;
  readonly log?: (message: string) => void;
}

export interface IngestResult {
  readonly status: RunStatus;
  readonly events: readonly EventCluster[];
  readonly chapters: readonly ChapterPlan[];
}

function berlinDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

/**
 * Milestone 3 ingestion: fetch → dedupe → group into events → rank → chapters.
 * Writes an internal ingest.json (input for the AI step in Milestone 4) and a readable report.md.
 * A failing source becomes a warning; the run only fails if no source delivers anything.
 */
export async function runIngest(options: IngestOptions): Promise<IngestResult> {
  const now = options.now ?? new Date();
  const log = options.log ?? (() => undefined);
  const startedAt = now.toISOString();
  const warnings: string[] = [];
  const errors: string[] = [];
  const ctx: FetchContext = {
    now,
    since: new Date(now.getTime() - (options.windowHours ?? 24) * 3_600_000),
    cacheDir: options.cacheDir,
    warn: (m) => warnings.push(m),
  };

  const fetched: Article[] = [];
  const perSource: Record<string, number> = {};
  await Promise.all(
    options.sources.map(async (source) => {
      const t0 = Date.now();
      try {
        const articles = await source.fetchArticles(ctx);
        perSource[source.id] = articles.length;
        fetched.push(...articles);
        log(`${source.id}: ${articles.length} articles in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
      } catch (error) {
        const message = `Source ${source.id} failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(message);
        log(message);
      }
    }),
  );

  const t1 = Date.now();
  const unique = dedupe(fetched);
  const events = scoreEvents(clusterArticles(unique), now);
  const chapters = buildChapters(events);
  log(
    `Grouped ${unique.length} articles into ${events.length} events in ${((Date.now() - t1) / 1000).toFixed(1)} s`,
  );

  const used = new Set(chapters.flatMap((c) => c.eventIds));
  const usedEvents = events.filter((e) => used.has(e.id));
  const date = berlinDate(now);
  const status: RunStatus = {
    schemaVersion: SCHEMA_VERSION,
    ok: fetched.length > 0,
    mode: "live",
    date,
    startedAt,
    finishedAt: new Date().toISOString(),
    counts: { articles: unique.length, events: usedEvents.length, playlists: chapters.length },
    warnings,
    errors: fetched.length > 0 ? errors : [...errors, "No source delivered any articles."],
  };

  await mkdir(options.outDir, { recursive: true });
  await writeFile(
    join(options.outDir, "ingest.json"),
    `${JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        date,
        generatedAt: startedAt,
        perSource,
        // Only events that appear in some chapter; trimmed to the first 12 articles each.
        events: usedEvents.map((e) => ({ ...e, articles: e.articles.slice(0, 12) })),
        chapters,
      },
      null,
      1,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(options.outDir, "report.md"),
    renderReport(date, perSource, events, chapters, status),
    "utf8",
  );
  await writeJson(join(options.outDir, "status.json"), RunStatus, status);
  return { status, events, chapters };
}

const SHOW_IN_REPORT = [
  "global",
  "europe",
  "asia",
  "north-america",
  "middle-east",
  "DE",
  "TR",
  "US",
  "GB",
  "FR",
  "JP",
];

function renderReport(
  date: string,
  perSource: Record<string, number>,
  events: readonly EventCluster[],
  chapters: readonly ChapterPlan[],
  status: RunStatus,
): string {
  const byId = new Map(events.map((e) => [e.id, e]));
  const nonEmpty = chapters.filter((c) => c.eventIds.length > 0).length;
  const lines = [
    `# Dawn ingestion report, ${date}`,
    "",
    `Articles after removing duplicates: ${status.counts.articles}. Sources: ${Object.entries(perSource)
      .map(([k, v]) => `${k} ${v}`)
      .join(", ")}.`,
    `Events found: ${events.length}. Events used in chapters (each summarized once by AI later): ${status.counts.events}.`,
    `Chapters with stories: ${nonEmpty} of ${chapters.length}.`,
    "",
  ];
  if (status.warnings.length > 0) {
    lines.push(
      `Warnings (${status.warnings.length}):`,
      ...status.warnings.slice(0, 20).map((w) => `- ${w}`),
      "",
    );
  }
  for (const scope of SHOW_IN_REPORT) {
    const chapter = chapters.find((c) => c.scope === scope);
    if (!chapter) continue;
    lines.push(`## ${chapter.title}`, "");
    if (chapter.eventIds.length === 0) lines.push(chapter.emptyReason ?? "No stories.", "");
    chapter.eventIds.forEach((id, i) => {
      const e = byId.get(id);
      if (!e) return;
      const countries = e.countries
        .slice(0, 3)
        .map((c) => `${c.iso2} ${Math.round(c.weight * 100)}%`)
        .join(", ");
      lines.push(
        `${i + 1}. **${e.title}** — score ${e.score}, ${e.outlets.length} outlets, ${e.articles.length} articles, ${e.languages.join("/")}; about ${countries || "?"}${e.place ? `; at ${e.place.name}` : ""}`,
        ...e.articles.slice(0, 3).map((a) => `   - [${a.outlet}](${a.url}) ${a.title}`),
      );
    });
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
