import type { ImageAsset } from "../schema/image";

export interface ImageQuery {
  /** Place names, most specific first. */
  readonly places: readonly string[];
  readonly keywords: readonly string[];
  readonly limit: number;
}

/** A licensed image provider (Wikimedia Commons, Openverse, NASA, ...). Built in Milestone 7. */
export interface ImageSource {
  readonly id: ImageAsset["provider"];
  /** Returns only images whose license already passed verifyLicense(). */
  search(query: ImageQuery, signal?: AbortSignal): Promise<ImageAsset[]>;
}
