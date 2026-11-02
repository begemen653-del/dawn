/**
 * News sources per region/country. Filled in Milestone 3.
 * Adding a country's feeds = adding one entry to SOURCES.
 */
import type { RegionId } from "./types";

export interface FeedSource {
  readonly id: string;
  /** Outlet name as shown to the user, e.g. "Tagesschau". */
  readonly outlet: string;
  readonly url: string;
  readonly language: string;
  /** Short note on the feed's terms of use (verified in M3). */
  readonly terms: string;
}

export interface SourceEntry {
  /** A region id or an ISO 3166-1 alpha-2 country code. */
  readonly scope: RegionId | (string & {});
  readonly feeds: readonly FeedSource[];
  /** Languages used when querying GDELT for this scope. */
  readonly gdeltLanguages: readonly string[];
}

export const SOURCES: readonly SourceEntry[] = [];
