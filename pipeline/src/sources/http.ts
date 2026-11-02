import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseRobots, type RobotsRules } from "./robots";
import { USER_AGENT } from "./types";

export interface HttpOptions {
  /** Folder for the ETag cache (persisted between runs by the GitHub Actions cache). */
  readonly cacheDir: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

interface CacheEntry {
  readonly etag?: string;
  readonly lastModified?: string;
  readonly file: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** fetch with a User-Agent, a timeout, and up to 3 tries with growing pauses on network/5xx errors. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * 3 ** (attempt - 1));
    try {
      const headers = new Headers(init.headers);
      headers.set("User-Agent", USER_AGENT);
      const res = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status >= 500 || res.status === 429) {
        lastError = new HttpError(`HTTP ${res.status} for ${url}`, res.status);
        continue;
      }
      return res;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${url}`);
}

/**
 * Text fetcher for feeds: checks robots.txt once per site and sends If-None-Match /
 * If-Modified-Since, reusing the cached body on "304 Not Modified".
 */
export class PoliteFetcher {
  private readonly robots = new Map<string, Promise<RobotsRules>>();
  private index: Record<string, CacheEntry> | null = null;

  constructor(private readonly options: HttpOptions) {}

  private async loadIndex(): Promise<Record<string, CacheEntry>> {
    if (this.index) return this.index;
    const path = join(this.options.cacheDir, "index.json");
    try {
      this.index = existsSync(path)
        ? (JSON.parse(await readFile(path, "utf8")) as Record<string, CacheEntry>)
        : {};
    } catch {
      this.index = {};
    }
    return this.index;
  }

  async saveIndex(): Promise<void> {
    if (!this.index) return;
    await mkdir(this.options.cacheDir, { recursive: true });
    await writeFile(join(this.options.cacheDir, "index.json"), JSON.stringify(this.index), "utf8");
  }

  private rulesFor(origin: string): Promise<RobotsRules> {
    let rules = this.robots.get(origin);
    if (!rules) {
      rules = fetchWithRetry(`${origin}/robots.txt`, {}, 15_000)
        .then(async (res) =>
          res.ok ? parseRobots(await res.text(), USER_AGENT) : parseRobots("", USER_AGENT),
        )
        // No robots.txt reachable: treat as allowed (the usual convention).
        .catch(() => parseRobots("", USER_AGENT));
      this.robots.set(origin, rules);
    }
    return rules;
  }

  async isAllowed(url: string): Promise<boolean> {
    const u = new URL(url);
    return (await this.rulesFor(u.origin)).isAllowed(u.pathname + u.search);
  }

  /** Returns the body, or throws HttpError / a robots.txt refusal. */
  async getText(url: string): Promise<{ body: string; fromCache: boolean }> {
    if (!(await this.isAllowed(url))) throw new Error(`robots.txt disallows ${url}`);
    const index = await this.loadIndex();
    const cached = index[url];
    const headers: Record<string, string> = {};
    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

    const res = await fetchWithRetry(url, { headers }, this.options.timeoutMs ?? 30_000);
    if (res.status === 304 && cached) {
      try {
        return { body: await readFile(join(this.options.cacheDir, cached.file), "utf8"), fromCache: true };
      } catch {
        // Cache file lost: fall through to a fresh, unconditional request.
        const fresh = await fetchWithRetry(url, {}, this.options.timeoutMs ?? 30_000);
        return this.store(url, fresh);
      }
    }
    return this.store(url, res);
  }

  private async store(url: string, res: Response): Promise<{ body: string; fromCache: boolean }> {
    if (!res.ok) throw new HttpError(`HTTP ${res.status} for ${url}`, res.status);
    const body = await res.text();
    const index = await this.loadIndex();
    const file = `${createHash("sha1").update(url).digest("hex")}.txt`;
    await mkdir(this.options.cacheDir, { recursive: true });
    await writeFile(join(this.options.cacheDir, file), body, "utf8");
    const etag = res.headers.get("etag");
    const lastModified = res.headers.get("last-modified");
    index[url] = { file, ...(etag ? { etag } : {}), ...(lastModified ? { lastModified } : {}) };
    return { body, fromCache: false };
  }
}
