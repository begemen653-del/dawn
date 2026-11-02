import { z } from "zod";
import { REGION_IDS } from "@dawn/config/types";

/** Bump when a stored JSON shape changes in a breaking way. */
export const SCHEMA_VERSION = 1 as const;
export const SchemaVersion = z.literal(SCHEMA_VERSION);

export const IsoDateTime = z.iso.datetime({ offset: true });
export const IsoDate = z.iso.date();
export const HttpUrl = z.url({ protocol: /^https?$/ });

export const Iso2 = z.string().regex(/^[A-Z]{2}$/, "Expected an ISO 3166-1 alpha-2 code");
export const RegionIdSchema = z.enum(REGION_IDS);
/** A chapter scope: a region id or a country ISO2 code. */
export const Scope = z.union([RegionIdSchema, Iso2]);

export const Longitude = z.number().min(-180).max(180);
export const Latitude = z.number().min(-90).max(90);
/** [longitude, latitude], the order MapLibre uses. */
export const LngLat = z.tuple([Longitude, Latitude]);

export const TOPICS = [
  "politics",
  "conflict",
  "economy",
  "business",
  "technology",
  "ai",
  "science",
  "climate",
  "health",
  "disaster",
  "society",
  "culture",
  "sports",
  "other",
] as const;
export const Topic = z.enum(TOPICS);
export type Topic = z.infer<typeof Topic>;

export const SourceLink = z.strictObject({
  outlet: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  url: HttpUrl,
  publishedAt: IsoDateTime,
  language: z.string().regex(/^[a-z]{2}$/),
});
export type SourceLink = z.infer<typeof SourceLink>;
