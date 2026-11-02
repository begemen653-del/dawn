import { z } from "zod";
import { TOPICS } from "../schema";

/**
 * What the AI returns for one event. It never invents coordinates: it picks place and country
 * ids from the candidate lists we give it, and code builds the globe scene from those.
 */
export const StoryDraft = z.object({
  id: z.string().min(1),
  /** False when the sources don't describe one clear news event (mixed stories, ads, listicles). */
  relevant: z.boolean(),
  headline: z.string().min(1).max(130),
  summary: z.string().min(1).max(600),
  whyItMatters: z.string().min(1).max(400),
  topic: z.enum(TOPICS),
  developing: z.boolean(),
  /** ISO2 codes, only from the candidate list: countries the story is really about. */
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(4),
  /** Candidate place ids ("P1"), most important first. */
  places: z.array(z.string().regex(/^P\d+$/)).max(3),
  visual: z.object({
    kind: z.enum(["point", "route", "area", "countries"]),
    from: z
      .string()
      .regex(/^P\d+$/)
      .optional(),
    to: z
      .string()
      .regex(/^P\d+$/)
      .optional(),
    routeKind: z.enum(["route", "movement", "trade", "flight", "other"]).optional(),
    areaKm: z.number().positive().max(3000).optional(),
  }),
  deeper: z
    .object({
      background: z.string().min(1).max(1200),
      keyPlayers: z
        .array(z.object({ name: z.string().min(1).max(80), role: z.string().min(1).max(200) }))
        .max(6),
      whatNext: z.string().min(1).max(800),
      timeline: z
        .array(z.object({ date: z.string().min(1).max(30), label: z.string().min(1).max(200) }))
        .max(8),
      simpler: z.string().min(1).max(600),
    })
    .nullable()
    .optional(),
});
export type StoryDraft = z.infer<typeof StoryDraft>;

export const DraftBatch = z.object({ stories: z.array(StoryDraft) });
export type DraftBatch = z.infer<typeof DraftBatch>;

export const LearnDraft = z.object({
  title: z.string().min(1).max(90),
  body: z.string().min(1).max(650),
  relatedEventId: z.string().min(1),
});
export type LearnDraft = z.infer<typeof LearnDraft>;
