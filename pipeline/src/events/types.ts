import type { Article } from "../schema/article";

/** A group of articles that describe the same real-world event. Built in Milestone 3. */
export interface EventCluster {
  readonly id: string;
  readonly articles: readonly Article[];
  /** ISO2 codes of every country the event concerns. */
  readonly countries: readonly string[];
  /** 0–100; higher = more important (source count, outlet spread, recency). */
  readonly score: number;
}
