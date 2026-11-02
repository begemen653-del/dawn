import type { Article } from "../schema/article";

export interface FetchContext {
  /** Only return articles published after this moment. */
  readonly since: Date;
  /** The run's "now" (fixed, so a run is reproducible). */
  readonly now: Date;
  /** Folder for downloads and the HTTP cache. */
  readonly cacheDir: string;
  /** Collects non-fatal problems for status.json. */
  readonly warn: (message: string) => void;
}

/** A news source (GDELT or a set of RSS feeds). */
export interface NewsSource {
  readonly id: string;
  /** Must not throw for a single bad item or feed; one failing source must not stop the run. */
  fetchArticles(ctx: FetchContext): Promise<Article[]>;
}

/**
 * Sent on every request so publishers can identify us. (The repo is private, so no URL:
 * a link publishers can't open would not help them.)
 */
export const USER_AGENT = "DawnBrief/0.1 (personal non-commercial news digest)";
