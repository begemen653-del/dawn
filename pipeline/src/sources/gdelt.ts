import { unzipSync } from "fflate";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Article } from "../schema";
import { parseGkgLine } from "./gkg";
import { fetchWithRetry } from "./http";
import type { FetchContext, NewsSource } from "./types";

const BASE = "https://data.gdeltproject.org/gdeltv2";

export interface GdeltOptions {
  /** Minutes between sampled 15-minute batches (60 = one batch per hour). */
  readonly stepMinutes: number;
  /** Also read GDELT's machine-translated batch (non-English outlets). */
  readonly includeTranslated: boolean;
  /** Parallel downloads. */
  readonly concurrency: number;
}

export const DEFAULT_GDELT_OPTIONS: GdeltOptions = {
  stepMinutes: 60,
  includeTranslated: true,
  concurrency: 4,
};

/** "YYYYMMDDHHMMSS" stamps of the batches to read, newest first, aligned to 15-minute slots. */
export function batchStamps(since: Date, now: Date, stepMinutes: number): string[] {
  const slot = 15 * 60_000;
  // Files appear a few minutes after their slot; skip the newest slot to avoid 404s.
  let t = Math.floor(now.getTime() / slot) * slot - slot;
  const stamps: string[] = [];
  while (t >= since.getTime()) {
    stamps.push(new Date(t).toISOString().replace(/[-:T]/g, "").slice(0, 14));
    t -= Math.max(15, stepMinutes) * 60_000;
  }
  return stamps;
}

async function runLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await task(item);
    }
  });
  await Promise.all(workers);
}

/**
 * GDELT Global Knowledge Graph: every news article GDELT saw, worldwide, with its title, the
 * places it mentions and its topics. We read sampled 15-minute batches from the free bulk files
 * (no API key, no request limits) and keep only the fields we need.
 */
export class GdeltSource implements NewsSource {
  readonly id = "gdelt";

  constructor(private readonly options: GdeltOptions = DEFAULT_GDELT_OPTIONS) {}

  async fetchArticles(ctx: FetchContext): Promise<Article[]> {
    const dir = join(ctx.cacheDir, "gdelt");
    await mkdir(dir, { recursive: true });
    const stamps = batchStamps(ctx.since, ctx.now, this.options.stepMinutes);
    const files = stamps.flatMap((s) => [
      `${s}.gkg.csv.zip`,
      ...(this.options.includeTranslated ? [`${s}.translation.gkg.csv.zip`] : []),
    ]);

    const articles: Article[] = [];
    let failed = 0;
    await runLimited(files, this.options.concurrency, async (file) => {
      try {
        const text = await this.download(dir, file);
        for (const line of text.split("\n")) {
          if (line === "") continue;
          const article = parseGkgLine(line);
          // A copy, so the kept fields don't hold the whole decoded batch (~20 MB each) in memory.
          if (article && new Date(article.publishedAt) >= ctx.since) articles.push(structuredClone(article));
        }
      } catch (error) {
        failed++;
        ctx.warn(`GDELT batch ${file} skipped: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    if (failed === files.length && files.length > 0) throw new Error("Every GDELT batch failed to download");
    await this.prune(dir, new Set(files));
    return articles;
  }

  /** Downloads and unzips one batch; batches never change, so a local copy is reused. */
  private async download(dir: string, file: string): Promise<string> {
    const path = join(dir, file);
    let zipped: Uint8Array;
    if (existsSync(path)) {
      zipped = await readFile(path);
    } else {
      const res = await fetchWithRetry(`${BASE}/${file}`, {}, 120_000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      zipped = new Uint8Array(await res.arrayBuffer());
      await writeFile(path, zipped);
    }
    const entries = unzipSync(zipped);
    const first = Object.values(entries)[0];
    if (!first) throw new Error("empty zip");
    return new TextDecoder("utf-8").decode(first);
  }

  /** Keeps the download folder from growing: removes batches this run didn't need. */
  private async prune(dir: string, keep: ReadonlySet<string>): Promise<void> {
    for (const name of await readdir(dir).catch(() => [])) {
      if (!keep.has(name)) await rm(join(dir, name), { force: true });
    }
  }
}
