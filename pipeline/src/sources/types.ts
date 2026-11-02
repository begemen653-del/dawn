import type { Article } from "../schema/article";

export interface FetchContext {
  /** Only return articles published after this moment. */
  readonly since: Date;
  /** Sent on every request so publishers can identify us. */
  readonly userAgent: string;
  readonly signal?: AbortSignal;
}

/** A news source (GDELT or one RSS feed). Built in Milestone 3. */
export interface NewsSource {
  readonly id: string;
  /** Must not throw for a single bad item; one failing source must not stop the run. */
  fetchArticles(ctx: FetchContext): Promise<Article[]>;
}

/** A contact URL (the repo) is added in Milestone 3, once the repo is public-facing. */
export const USER_AGENT = "DawnBrief/0.1 (personal non-commercial news digest)";
