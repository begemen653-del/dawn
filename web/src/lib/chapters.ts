import type { StoryEvent } from "@dawn/pipeline/schema";
import type { LoadedBrief } from "./brief";
import { chapterOrder, scopeInfo, type Scope, type ScopeInfo } from "./selection";

export interface Chapter extends ScopeInfo {
  readonly stories: readonly StoryEvent[];
  /** Set when the chapter has no stories today; shown instead of skipping silently. */
  readonly emptyReason?: string;
}

/** One step of the brief: a story, or a short note for an empty chapter. */
export interface Slide {
  readonly chapterIndex: number;
  readonly story: StoryEvent | null;
  /** Position inside the chapter (0-based) and chapter length, for "story 2 of 4". */
  readonly position: number;
  readonly chapterLength: number;
}

type BriefData = Pick<LoadedBrief, "events" | "playlists"> & { readonly sample: boolean };

export function buildChapters(selection: readonly Scope[], brief: BriefData): Chapter[] {
  return chapterOrder(selection).map((scope) => {
    const info = scopeInfo(scope);
    const playlist = brief.playlists.find((p) => p.scope === scope);
    const stories = (playlist?.eventIds ?? []).flatMap((id) => brief.events.get(id) ?? []);
    if (stories.length > 0) return { ...info, stories };
    const emptyReason =
      playlist?.emptyReason ??
      (brief.sample
        ? `No sample stories for ${info.title}. Real news arrives in a later milestone.`
        : `Almost no news from ${info.title} today.`);
    return { ...info, stories, emptyReason };
  });
}

export function buildSlides(chapters: readonly Chapter[]): Slide[] {
  return chapters.flatMap((chapter, chapterIndex): Slide[] =>
    chapter.stories.length === 0
      ? [{ chapterIndex, story: null, position: 0, chapterLength: 0 }]
      : chapter.stories.map((story, position) => ({
          chapterIndex,
          story,
          position,
          chapterLength: chapter.stories.length,
        })),
  );
}
