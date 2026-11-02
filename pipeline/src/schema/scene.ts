import { z } from "zod";
import { Iso2, Latitude, LngLat, Longitude } from "./common";

/**
 * Scene directive: what the globe shows for one story.
 * Produced by the AI, validated here, rendered by the web app.
 * All objects are strict and the element union is closed: unknown types or keys are rejected.
 */
export const SceneCamera = z.strictObject({
  lng: Longitude,
  lat: Latitude,
  zoom: z.number().min(0.5).max(14),
  bearing: z.number().min(-180).max(180).optional(),
  pitch: z.number().min(0).max(60).optional(),
});

const ElementId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const Label = z.string().min(1).max(60);
const Tone = z.enum(["focus", "neutral", "alert"]);

export const MarkerElement = z.strictObject({
  type: z.literal("marker"),
  id: ElementId,
  at: LngLat,
  label: Label,
  emphasis: z.enum(["primary", "secondary"]).default("primary"),
});

export const HighlightElement = z.strictObject({
  type: z.literal("highlight"),
  id: ElementId,
  /** Country to fill (ISO2); polygons come from the bundled boundaries. */
  country: Iso2,
  label: Label.optional(),
  tone: Tone.default("focus"),
});

export const ArcElement = z.strictObject({
  type: z.literal("arc"),
  id: ElementId,
  from: LngLat,
  to: LngLat,
  kind: z.enum(["route", "movement", "trade", "flight", "other"]),
  label: Label.optional(),
  animated: z.boolean().default(true),
});

export const AreaElement = z.strictObject({
  type: z.literal("area"),
  id: ElementId,
  center: LngLat,
  radiusKm: z.number().positive().max(3000),
  label: Label.optional(),
  tone: Tone.default("alert"),
});

export const TimelineStepElement = z.strictObject({
  type: z.literal("timelineStep"),
  id: ElementId,
  order: z.int().min(1).max(10),
  label: Label,
  date: z.string().max(30).optional(),
  focus: LngLat.optional(),
});

export const SceneElement = z.discriminatedUnion("type", [
  MarkerElement,
  HighlightElement,
  ArcElement,
  AreaElement,
  TimelineStepElement,
]);
export type SceneElement = z.infer<typeof SceneElement>;

export const SceneDirective = z
  .strictObject({
    camera: SceneCamera,
    elements: z.array(SceneElement).max(12),
  })
  .superRefine((scene, ctx) => {
    const seen = new Set<string>();
    for (const el of scene.elements) {
      if (seen.has(el.id)) ctx.addIssue({ code: "custom", message: `Duplicate element id "${el.id}"` });
      seen.add(el.id);
    }
  });
export type SceneDirective = z.infer<typeof SceneDirective>;
