import { COUNTRIES, getCountry } from "@dawn/config";
import { z } from "zod";
import type { LlmProvider } from "../ai/provider";
import type { ImageAsset } from "../schema/image";
import type { StoryEvent } from "../schema";
import type { Found } from "./commons";

/** Anything that finds licensed photos (Commons, or a stub in tests). */
export interface PhotoSource {
  /** Good photos taken near a point (illustrative photos of the place). */
  near(at: readonly [number, number], radiusKm: number): Promise<Found[]>;
  /** The newest official photos mentioning these names (possibly of the event itself). */
  recent(terms: readonly string[]): Promise<Found[]>;
}

export interface PhotoPlace {
  readonly name: string;
  readonly at: readonly [number, number];
  readonly radiusKm: number;
}

export interface PickOptions {
  /** Checks which photos really fit each story. Without it, only clearly matching event photos stay. */
  readonly llm?: LlmProvider;
  readonly perStory?: number;
  /** The same photo appears on at most this many stories. */
  readonly maxUses?: number;
  /** Stop searching after this time (ms since 1970); stories without photos still publish. */
  readonly deadline?: number;
  readonly log?: (message: string) => void;
}

export interface PickResult {
  readonly stories: Map<string, StoryEvent>;
  readonly withImages: number;
  readonly eventPhotos: number;
  readonly failures: number;
}

interface Candidate {
  readonly key: string;
  readonly found: Found;
  readonly kind: "event" | "place";
}

/** An official photo counts as "from the event" only if taken within this many days of the story. */
const EVENT_WINDOW_DAYS = 3;
const MAX_CANDIDATES = 6;
const AI_BATCH = 20;
const DAY = 86_400_000;

/** Where to look for place photos, most specific first: the story's pins, then a small country. */
export function placesFor(story: StoryEvent): PhotoPlace[] {
  const places: PhotoPlace[] = story.locations.map((l) => ({ name: l.name, at: l.at, radiusKm: 12 }));
  const country = story.countries[0] ? getCountry(story.countries[0]) : undefined;
  // Only small countries: the middle of a big one (the USA's is in Kansas) says nothing about the story.
  if (country && country.camera.zoom >= 5) {
    const radiusKm = Math.min(150, 2 ** (10 - country.camera.zoom) * 2);
    places.push({ name: country.name, at: [country.camera.lng, country.camera.lat], radiusKm });
  }
  const seen = new Set<string>();
  return places
    .filter((p) => {
      const key = `${p.at[0].toFixed(2)},${p.at[1].toFixed(2)}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .slice(0, 3);
}

const NOT_NAMES = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "with",
  "after",
  "as",
  "by",
  "from",
  "over",
  "new",
  "us",
  "u.s",
  "uk",
  "eu",
  "un",
  "says",
  "will",
  "is",
  "are",
  "why",
  "how",
  "what",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
]);
const COUNTRY_NAMES = new Set(COUNTRIES.map((c) => c.name.toLowerCase()));

/**
 * Names to look for official photos of the event: people and organisations in the headline
 * ("Trump, Putin and Xi hold summit" → Trump, Putin). Country and place names are left out:
 * they match thousands of unrelated photos.
 */
export function eventTerms(story: StoryEvent): string[] {
  const places = new Set(story.locations.map((l) => l.name.toLowerCase()));
  const words = story.headline.match(/\p{Lu}[\p{L}’'.-]*/gu) ?? [];
  const terms: string[] = [];
  for (const raw of words) {
    const word = raw.replace(/['’]s$/, "").replace(/[.-]+$/, "");
    const lower = word.toLowerCase();
    if (word.length < 2 || NOT_NAMES.has(lower) || COUNTRY_NAMES.has(lower) || places.has(lower)) continue;
    if (!terms.includes(word)) terms.push(word);
  }
  return terms.slice(0, 2);
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** An official photo taken (or, without a date, uploaded) within a few days of the story. */
function recentEnough(found: Found, storyTime: string): boolean {
  const when = Date.parse(found.takenAt ?? found.uploadedAt ?? "");
  if (Number.isNaN(when)) return false;
  return Math.abs(when - Date.parse(storyTime)) <= EVENT_WINDOW_DAYS * DAY;
}

// ---- AI check ---------------------------------------------------------------------------------

export const PHOTO_SYSTEM_PROMPT = `You check whether photos fit news stories in a calm morning news brief.
For each story you get its headline, a short summary and candidate photos (key, kind, date, description).
Choose at most 2 photos that a reader would clearly connect with the story:
- An "event" photo fits if its description shows this same event (same people, meeting, place, date).
  Set "showsEvent": true only then.
- A "place" photo fits if it shows the story's place in a recognisable way (a landmark, a city view,
  the building involved). Not: unrelated objects, interiors that say nothing, animals, random streets.
- If nothing fits, return an empty list. No photo is better than a misleading one.
Answer with JSON only: {"stories": [{"id": "...", "photos": [{"p": "e1", "showsEvent": true}]}]}`;

const Verdicts = z.object({
  stories: z.array(
    z.object({
      id: z.string(),
      photos: z.array(z.object({ p: z.string(), showsEvent: z.boolean().catch(false) })).catch([]),
    }),
  ),
});

interface Choice {
  readonly key: string;
  readonly showsEvent: boolean;
}

function describe(story: StoryEvent, candidates: readonly Candidate[]): string {
  const lines = [`[${story.id}] ${story.headline}`, `  ${story.summary.slice(0, 240)}`];
  for (const c of candidates) {
    const when = c.found.takenAt ?? c.found.uploadedAt?.slice(0, 10) ?? "date unknown";
    lines.push(`  ${c.key} (${c.kind} photo, ${when}): ${c.found.image.alt}`);
  }
  return lines.join("\n");
}

async function askAi(
  llm: LlmProvider,
  items: readonly { story: StoryEvent; candidates: readonly Candidate[] }[],
  log?: (message: string) => void,
): Promise<Map<string, Choice[]> | null> {
  const out = new Map<string, Choice[]>();
  for (let i = 0; i < items.length; i += AI_BATCH) {
    const batch = items.slice(i, i + AI_BATCH);
    try {
      const { value } = await llm.generateJson(
        {
          system: PHOTO_SYSTEM_PROMPT,
          prompt: batch.map((b) => describe(b.story, b.candidates)).join("\n\n"),
          maxOutputTokens: 60 * batch.length + 300,
          temperature: 0,
        },
        Verdicts,
      );
      for (const s of value.stories) {
        const keys = new Set(batch.find((b) => b.story.id === s.id)?.candidates.map((c) => c.key));
        out.set(
          s.id,
          s.photos.filter((p) => keys.has(p.p)).map((p) => ({ key: p.p, showsEvent: p.showsEvent })),
        );
      }
    } catch (error) {
      log?.(`Photo check failed: ${error instanceof Error ? error.message : String(error)}`);
      return out.size > 0 ? out : null;
    }
  }
  return out;
}

/** Without the AI: only an official recent photo whose description names the headline's people. */
function fallbackChoice(story: StoryEvent, candidates: readonly Candidate[]): Choice[] {
  const terms = eventTerms(story).map((t) => t.toLowerCase());
  if (terms.length === 0) return [];
  return candidates
    .filter((c) => c.kind === "event" && terms.every((t) => c.found.image.alt.toLowerCase().includes(t)))
    .slice(0, 1)
    .map((c) => ({ key: c.key, showsEvent: false }));
}

// ---- Picking ----------------------------------------------------------------------------------

/**
 * Adds up to two licensed photos to each story (most important first):
 * 1. official photos of the event itself (the headline's names, taken within days),
 * 2. good photos of the story's place.
 * The AI then keeps only photos that clearly fit. A photo counts as "from the event" only when
 * the AI says so AND it is an official photo taken within a few days; otherwise it stays
 * labelled illustrative. Stories where nothing fits get no photo.
 */
export async function addImages(
  stories: ReadonlyMap<string, StoryEvent>,
  source: PhotoSource,
  options: PickOptions = {},
): Promise<PickResult> {
  const perStory = options.perStory ?? 2;
  const maxUses = options.maxUses ?? 3;
  const cache = new Map<string, Promise<Found[]>>();
  let failures = 0;

  const cached = (key: string, load: () => Promise<Found[]>, what: string): Promise<Found[]> => {
    let p = cache.get(key);
    if (!p) {
      p = load().catch((error: unknown) => {
        failures++;
        options.log?.(`Photos for ${what} failed: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      });
      cache.set(key, p);
    }
    return p;
  };

  // 1. Collect candidates.
  const ordered = [...stories.values()].sort((a, b) => b.importance - a.importance);
  const items: { story: StoryEvent; candidates: Candidate[] }[] = [];
  for (const story of ordered) {
    if (options.deadline !== undefined && Date.now() > options.deadline) {
      options.log?.("Photo time limit reached: the remaining stories have no pictures.");
      break;
    }
    const candidates: Candidate[] = [];
    const add = (found: Found, kind: Candidate["kind"]) => {
      if (candidates.length >= MAX_CANDIDATES) return;
      if (candidates.some((c) => c.found.image.id === found.image.id)) return;
      const n = candidates.filter((c) => c.kind === kind).length + 1;
      candidates.push({ key: `${kind === "event" ? "e" : "p"}${n}`, found, kind });
    };

    const terms = eventTerms(story);
    if (terms.length > 0) {
      const recent = await cached(`recent:${terms.join("|")}`, () => source.recent(terms), terms.join(" "));
      for (const f of recent.filter((x) => recentEnough(x, story.time)).slice(0, 3)) add(f, "event");
    }
    for (const place of placesFor(story)) {
      const key = `near:${place.at[0].toFixed(2)},${place.at[1].toFixed(2)},${place.radiusKm}`;
      const found = await cached(key, () => source.near(place.at, place.radiusKm), place.name);
      // Start at a different photo per story, so stories in the same city don't all look alike.
      const start = found.length > 0 ? hash(story.id) % Math.min(found.length, 4) : 0;
      for (const f of [...found.slice(start), ...found.slice(0, start)].slice(0, 2)) add(f, "place");
    }
    if (candidates.length > 0) items.push({ story, candidates });
  }

  // 2. Keep only what fits.
  const verdicts = options.llm ? await askAi(options.llm, items, options.log) : null;
  if (options.llm && !verdicts)
    options.log?.("Photo check unavailable: only clearly matching event photos kept.");
  if (verdicts) {
    const kept = [...verdicts.values()].filter((v) => v.length > 0).length;
    options.log?.(
      `Photo check: ${items.length} stories had candidates, ${verdicts.size} answered, ${kept} kept a photo`,
    );
  }

  const uses = new Map<string, number>();
  const out = new Map(stories);
  let withImages = 0;
  let eventPhotos = 0;
  for (const { story, candidates } of items) {
    const choices = verdicts ? (verdicts.get(story.id) ?? []) : fallbackChoice(story, candidates);
    const chosen: ImageAsset[] = [];
    for (const choice of choices) {
      const c = candidates.find((x) => x.key === choice.key);
      if (!c || chosen.length >= perStory || (uses.get(c.found.image.id) ?? 0) >= maxUses) continue;
      // "From the event" needs both: the AI's yes and an official photo taken within days.
      const fromEvent = choice.showsEvent && c.kind === "event" && recentEnough(c.found, story.time);
      if (fromEvent) eventPhotos++;
      chosen.push({ ...c.found.image, illustrative: !fromEvent });
      uses.set(c.found.image.id, (uses.get(c.found.image.id) ?? 0) + 1);
    }
    if (chosen.length > 0) {
      withImages++;
      out.set(story.id, { ...story, images: chosen });
    }
  }
  return { stories: out, withImages, eventPhotos, failures };
}
