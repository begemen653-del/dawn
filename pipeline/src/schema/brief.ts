import { z } from "zod";
import { IsoDate, IsoDateTime, SchemaVersion, Scope } from "./common";

/** One chapter of the brief: a region or country, pointing at events by id. */
export const Playlist = z
  .strictObject({
    schemaVersion: SchemaVersion,
    date: IsoDate,
    scope: Scope,
    title: z.string().min(1).max(80),
    eventIds: z.array(z.string().min(1)).max(8),
    /** Shown instead of stories when there is almost no news for this scope. */
    emptyReason: z.string().min(1).max(200).optional(),
  })
  .refine((p) => p.eventIds.length > 0 || p.emptyReason !== undefined, {
    message: "An empty playlist must explain why (emptyReason)",
  });
export type Playlist = z.infer<typeof Playlist>;

export const LearnCard = z.strictObject({
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(700),
  relatedEventId: z.string().min(1).optional(),
});
export type LearnCard = z.infer<typeof LearnCard>;

/** Entry point the app loads first: what exists for today. */
export const DayIndex = z.strictObject({
  schemaVersion: SchemaVersion,
  date: IsoDate,
  generatedAt: IsoDateTime,
  /** True when built from sample fixtures rather than real news. */
  sample: z.boolean(),
  scopes: z.array(z.strictObject({ scope: Scope, file: z.string().min(1), count: z.int().min(0) })),
  learn: LearnCard,
});
export type DayIndex = z.infer<typeof DayIndex>;

export const RunStatus = z.strictObject({
  schemaVersion: SchemaVersion,
  ok: z.boolean(),
  mode: z.enum(["dry", "live"]),
  date: IsoDate,
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime,
  counts: z.strictObject({
    articles: z.int().min(0),
    events: z.int().min(0),
    playlists: z.int().min(0),
  }),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
});
export type RunStatus = z.infer<typeof RunStatus>;
