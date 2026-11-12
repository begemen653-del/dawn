import type { ChapterPlan } from "../events/assign";
import { fold } from "../events/text";
import type { StoryEvent } from "../schema";

const STOP_WORDS = new Set(
  (
    "that this with from after over their have been were will said says amid following into about than more " +
    "most also which while where when what other they them there just like only some such very"
  ).split(" "),
);

const MAX_SOURCES = 10;

/** Content words of a text, lightly stemmed ("resigns", "resigned" → "resign"). */
function words(text: string): Set<string> {
  return new Set(
    fold(text)
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .map((w) => w.replace(/(ing|ed|es|s)$/, "")),
  );
}

/** Share of the smaller text's words that also appear in the other. */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / Math.min(a.size, b.size);
}

/**
 * Two stories about the same news: they share a country and most of their wording. Clustering
 * works on raw headlines in many languages, so one event sometimes arrives as two clusters; once
 * the AI has written both in English, the repeat is easy to see.
 */
export function isSameStory(a: StoryEvent, b: StoryEvent): boolean {
  if (!a.countries.some((c) => b.countries.includes(c))) return false;
  const body = overlap(words(`${a.headline} ${a.summary}`), words(`${b.headline} ${b.summary}`));
  const head = overlap(words(a.headline), words(b.headline));
  return body >= 0.43 || (head >= 0.6 && body >= 0.33);
}

/**
 * Merges repeated stories: the most important one stays and gains the others' sources; the
 * repeats disappear from every chapter. Thresholds were tuned on the 2026-11-12 full brief.
 */
export function mergeDuplicates(
  chapters: readonly ChapterPlan[],
  stories: ReadonlyMap<string, StoryEvent>,
): { chapters: ChapterPlan[]; stories: Map<string, StoryEvent>; merged: number } {
  const ranked = [...stories.values()].sort(
    (a, b) => b.importance - a.importance || b.sources.length - a.sources.length,
  );
  const keeperOf = new Map<string, string>();
  const kept: StoryEvent[] = [];
  for (const story of ranked) {
    const keeper = kept.find((k) => isSameStory(k, story));
    if (!keeper) {
      kept.push(story);
      keeperOf.set(story.id, story.id);
      continue;
    }
    keeperOf.set(story.id, keeper.id);
    const urls = new Set(keeper.sources.map((s) => s.url));
    const extra = story.sources.filter((s) => !urls.has(s.url));
    const i = kept.indexOf(keeper);
    kept[i] = { ...keeper, sources: [...keeper.sources, ...extra].slice(0, MAX_SOURCES) };
  }

  const out = new Map(kept.map((s) => [s.id, s]));
  const remapped = chapters.map((c) => ({
    ...c,
    eventIds: [...new Set(c.eventIds.map((id) => keeperOf.get(id) ?? id))],
  }));
  return { chapters: remapped, stories: out, merged: stories.size - out.size };
}
