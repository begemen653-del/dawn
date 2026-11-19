import { getCountry } from "@dawn/config";
import { geoDistance } from "d3-geo";
import { SceneDirective, type SceneElement, type StoryEvent, type Topic } from "../schema";
import type { StoryDraft } from "./drafts";
import type { PlaceCandidate } from "./prompts";

/** Deep zoom: a city fills the screen with its districts' names; a region shows its towns. */
const ZOOM_BY_KIND = { city: 7.2, region: 5.4, country: 4 } as const;

function shortName(name: string): string {
  return (name.split(",")[0] ?? name).trim().slice(0, 60);
}

function elementId(prefix: string, i: number): string {
  return `${prefix}-${i}`;
}

/** Zoom that fits two points (same formula as the country catalog's camera). */
function zoomForSpan(a: readonly [number, number], b: readonly [number, number]): number {
  const spanDeg = (geoDistance([a[0], a[1]], [b[0], b[1]]) * 180) / Math.PI;
  return Math.min(6, Math.max(1.6, Math.log2(280 / Math.max(spanDeg * 1.6, 0.5))));
}

/**
 * Builds the globe scene from the AI's choices. Coordinates always come from our own data
 * (GDELT places or the country catalog), never from the model.
 */
export function buildScene(
  draft: StoryDraft,
  candidates: readonly PlaceCandidate[],
  topic: Topic,
): { scene: SceneDirective; locations: StoryEvent["locations"] } {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const chosen = draft.places.flatMap((id) => byId.get(id) ?? []);
  const countries = draft.countries.filter((c) => getCountry(c));
  const tone = topic === "conflict" || topic === "disaster" ? "alert" : "focus";

  // Fall back to the first country's label point when no place was chosen.
  const fallback = countries[0] ? getCountry(countries[0]) : undefined;
  const main: PlaceCandidate | undefined =
    chosen[0] ??
    (fallback
      ? {
          id: "C",
          name: fallback.name,
          at: [fallback.camera.lng, fallback.camera.lat],
          country: fallback.iso2,
          kind: "country",
        }
      : candidates[0]);

  const elements: SceneElement[] = [];
  countries.slice(0, 3).forEach((iso2, i) => {
    elements.push({
      type: "highlight",
      id: elementId("country", i),
      country: iso2,
      tone: i === 0 ? tone : "neutral",
    });
  });

  let camera = { lng: 15, lat: 25, zoom: 1.4 };
  if (main) {
    const countryZoom =
      main.kind === "country" && main.country ? getCountry(main.country)?.camera.zoom : undefined;
    camera = { lng: main.at[0], lat: main.at[1], zoom: countryZoom ?? ZOOM_BY_KIND[main.kind] };
  }

  const from = draft.visual.from ? byId.get(draft.visual.from) : undefined;
  const to = draft.visual.to ? byId.get(draft.visual.to) : undefined;
  if (draft.visual.kind === "route" && from && to && from.id !== to.id) {
    elements.push({
      type: "arc",
      id: "route",
      from: [from.at[0], from.at[1]],
      to: [to.at[0], to.at[1]],
      kind: draft.visual.routeKind ?? "route",
      animated: true,
    });
    const mid: [number, number] = [(from.at[0] + to.at[0]) / 2, (from.at[1] + to.at[1]) / 2];
    camera = { lng: mid[0], lat: mid[1], zoom: zoomForSpan(from.at, to.at) };
  } else if (draft.visual.kind === "area" && main) {
    elements.push({
      type: "area",
      id: "area",
      center: [main.at[0], main.at[1]],
      radiusKm: Math.min(1500, draft.visual.areaKm ?? 150),
      tone: "alert",
    });
  }

  // Whole countries are shown by their highlight; pins are for cities and regions.
  const precise = chosen.filter((p) => p.kind !== "country");
  const markerPlaces = precise.length > 0 ? precise : main && main.kind !== "country" ? [main] : [];
  markerPlaces.slice(0, 3).forEach((p, i) => {
    elements.push({
      type: "marker",
      id: elementId("place", i),
      at: [p.at[0], p.at[1]],
      label: shortName(p.name),
      emphasis: i === 0 ? "primary" : "secondary",
    });
  });

  // The story's place line still names every chosen place, countries included.
  const named = chosen.length > 0 ? chosen : markerPlaces;
  const locations: StoryEvent["locations"] = (named.length > 0 ? named : main ? [main] : [])
    .slice(0, 6)
    .map((p) => ({
      name: shortName(p.name),
      at: [p.at[0], p.at[1]],
      ...(p.country ? { country: p.country } : {}),
    }));

  return { scene: SceneDirective.parse({ camera, elements }), locations };
}
