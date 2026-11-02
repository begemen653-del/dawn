import { z } from "zod";
import { Iso2, IsoDate, IsoDateTime, LngLat, SchemaVersion, SourceLink, Topic } from "./common";
import { ImageAsset } from "./image";
import { SceneDirective } from "./scene";

export const StoryLocation = z.strictObject({
  name: z.string().min(1).max(80),
  at: LngLat,
  country: Iso2.optional(),
});

export const DeeperContent = z.strictObject({
  background: z.string().min(1).max(1200),
  keyPlayers: z
    .array(z.strictObject({ name: z.string().min(1).max(80), role: z.string().min(1).max(200) }))
    .max(8),
  whatNext: z.string().min(1).max(800),
  timeline: z
    .array(z.strictObject({ date: z.string().min(1).max(30), label: z.string().min(1).max(200) }))
    .max(12),
  simpler: z.string().min(1).max(600),
});
export type DeeperContent = z.infer<typeof DeeperContent>;

/** One news event, summarized once and referenced by every playlist it belongs to. */
export const StoryEvent = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{4,80}$/),
  headline: z.string().min(1).max(140),
  /** 2–3 sentences in plain words. */
  summary: z.string().min(1).max(600),
  whyItMatters: z.string().min(1).max(400),
  topic: Topic,
  time: IsoDateTime,
  developing: z.boolean(),
  locations: z.array(StoryLocation).min(1).max(6),
  /** Two or more independent sources. */
  sources: z.array(SourceLink).min(2).max(10),
  /** Always true: shown as the "AI-generated from these sources" label. */
  aiGenerated: z.literal(true),
  importance: z.number().min(0).max(100),
  countries: z.array(Iso2),
  scene: SceneDirective,
  images: z.array(ImageAsset).max(6),
  /** Pre-generated for top events; null means "generate on demand". */
  deeper: DeeperContent.nullable(),
});
export type StoryEvent = z.infer<typeof StoryEvent>;

export const EventStore = z.strictObject({
  schemaVersion: SchemaVersion,
  date: IsoDate,
  generatedAt: IsoDateTime,
  events: z.array(StoryEvent),
});
export type EventStore = z.infer<typeof EventStore>;
