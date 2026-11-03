import { z } from "zod";
import { TOPICS } from "../schema";

/*
 * Models get small format details wrong in harmless ways ("null" instead of leaving a field out,
 * key players as a sentence, "event" instead of "label"). These helpers normalise such variants
 * before validation, so a good story isn't thrown away over formatting. Content checks
 * (grounding) still apply to whatever comes out.
 */

/** null → undefined, so optional fields accept an explicit null. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === null ? undefined : v), schema.optional());

/** Cuts over-long text at a word boundary instead of rejecting the story. */
const text = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.length > max ? `${v.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : v),
    z.string().min(1).max(max),
  );

const KeyPlayers = z.preprocess(
  (v) => {
    if (typeof v === "string" || v === null || v === undefined) return []; // "The sources don't say."
    if (!Array.isArray(v) && typeof v === "object") {
      // {"Name": "role", ...}
      return Object.entries(v as Record<string, unknown>).map(([name, role]) => ({
        name,
        role: String(role),
      }));
    }
    return v;
  },
  z.array(z.object({ name: text(80), role: text(200) })).max(6),
);

const Timeline = z.preprocess(
  (v) => {
    if (!Array.isArray(v)) return [];
    return v.map((item: unknown) => {
      if (typeof item !== "object" || item === null) return item;
      const o = item as Record<string, unknown>;
      return { date: o.date ?? o.time ?? "", label: o.label ?? o.event ?? o.description ?? o.text ?? "" };
    });
  },
  z.array(z.object({ date: text(30), label: text(200) })).max(8),
);

const PlaceId = z.string().regex(/^P\d+$/);

/**
 * What the AI returns for one event. It never invents coordinates: it picks place and country
 * ids from the candidate lists we give it, and code builds the globe scene from those.
 */
export const StoryDraft = z.object({
  id: z.string().min(1),
  /** False when the sources don't describe one clear news event (mixed stories, ads, listicles). */
  relevant: z.boolean(),
  headline: text(130),
  summary: text(600),
  whyItMatters: text(400),
  topic: z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(TOPICS).catch("other")),
  developing: z.boolean().catch(false),
  /** ISO2 codes, only from the candidate list: countries the story is really about. */
  countries: z.preprocess(
    (v: unknown) => (Array.isArray(v) ? (v as unknown[]).slice(0, 4) : []),
    z.array(z.string().regex(/^[A-Z]{2}$/)),
  ),
  /** Candidate place ids ("P1"), most important first. */
  places: z.preprocess(
    (v: unknown) => (Array.isArray(v) ? (v as unknown[]).slice(0, 3) : []),
    z.array(PlaceId),
  ),
  visual: z.preprocess(
    (v) => v ?? { kind: "point" },
    z.object({
      kind: z.enum(["point", "route", "area", "countries"]).catch("point"),
      from: optional(PlaceId),
      to: optional(PlaceId),
      routeKind: optional(z.enum(["route", "movement", "trade", "flight", "other"]).catch("other")),
      areaKm: optional(z.number().positive().max(3000)),
    }),
  ),
  deeper: z
    .object({
      background: text(1200),
      keyPlayers: KeyPlayers,
      whatNext: text(800),
      timeline: Timeline,
      simpler: text(600),
    })
    .nullable()
    .optional(),
});
export type StoryDraft = z.infer<typeof StoryDraft>;

export const DraftBatch = z.object({ stories: z.array(StoryDraft) });
export type DraftBatch = z.infer<typeof DraftBatch>;

export const LearnDraft = z.object({
  title: text(90),
  body: text(650),
  relatedEventId: z.string().min(1),
});
export type LearnDraft = z.infer<typeof LearnDraft>;
