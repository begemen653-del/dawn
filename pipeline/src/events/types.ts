import type { Article, ArticlePlace } from "../schema/article";

/** A group of articles that describe the same real-world event. */
export interface EventCluster {
  readonly id: string;
  /** Best headline to represent the group (English and curated outlets preferred). */
  readonly title: string;
  /** Most representative first. */
  readonly articles: readonly Article[];
  readonly outlets: readonly string[];
  /** Distinct headlines: copies of one wire story count once. Better than outlet counts for importance. */
  readonly voices: number;
  /** Hand-picked outlets (BBC, DW, Tagesschau, ...) that covered it. */
  readonly curatedOutlets: number;
  readonly languages: readonly string[];
  /** Countries the event is about with the share of articles mentioning each (0–1), strongest first. */
  readonly countries: readonly { readonly iso2: string; readonly weight: number }[];
  /** The most-mentioned precise place, for the globe. */
  readonly place: ArticlePlace | null;
  readonly themes: readonly string[];
  readonly firstSeen: string;
  readonly lastSeen: string;
  readonly curated: boolean;
  /** 0–100; higher = more important. */
  score: number;
}
