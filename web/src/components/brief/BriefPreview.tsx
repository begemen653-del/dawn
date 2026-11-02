"use client";

import { getCountry, getRegion, REGION_IDS, type RegionId } from "@dawn/config";
import type { Playlist, StoryEvent } from "@dawn/pipeline/schema";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { GlassCard } from "@/components/ui/GlassCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { BriefLoadError, loadLatestBrief, type LoadedBrief } from "@/lib/brief";
import { GlobePlaceholder } from "./GlobePlaceholder";
import { StoryCard } from "./StoryCard";

type State =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly brief: LoadedBrief };

interface Chapter {
  readonly scope: string;
  readonly title: string;
  readonly flag: string;
  readonly stories: readonly StoryEvent[];
}

function chapterFlag(scope: string): string {
  if ((REGION_IDS as readonly string[]).includes(scope)) return scope === "global" ? "🌍" : "🗺️";
  return getCountry(scope)?.flag ?? "📍";
}

function chapterTitle(playlist: Playlist): string {
  if ((REGION_IDS as readonly string[]).includes(playlist.scope))
    return getRegion(playlist.scope as RegionId).name;
  return getCountry(playlist.scope)?.name ?? playlist.title;
}

/** Chapters in brief order: everything else first, Global always last. */
function toChapters(brief: LoadedBrief): Chapter[] {
  const chapters = brief.playlists.map((p) => ({
    scope: p.scope,
    title: chapterTitle(p),
    flag: chapterFlag(p.scope),
    stories: p.eventIds.flatMap((id) => brief.events.get(id) ?? []),
  }));
  return [...chapters.filter((c) => c.scope !== "global"), ...chapters.filter((c) => c.scope === "global")];
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });
const updatedFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

/**
 * Milestone 1 preview of the brief layout: chapters, progress, explanation card,
 * picture column, globe area and controls. Auto-play and the real globe come later.
 */
export function BriefPreview() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [chapterIndex, setChapterIndex] = useState(0);
  const [storyIndex, setStoryIndex] = useState(0);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const controller = new AbortController();
    loadLatestBrief(controller.signal)
      .then((brief) => {
        setState({ kind: "ready", brief });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof BriefLoadError ? error.message : "Something went wrong loading the brief.";
        setState({ kind: "error", message });
      });
    return () => {
      controller.abort();
    };
  }, []);

  const chapters = useMemo(() => (state.kind === "ready" ? toChapters(state.brief) : []), [state]);
  const chapter = chapters[chapterIndex];
  const story = chapter?.stories[storyIndex];

  function goTo(nextChapter: number, nextStory: number) {
    setChapterIndex(nextChapter);
    setStoryIndex(nextStory);
  }

  function next() {
    if (!chapter) return;
    if (storyIndex < chapter.stories.length - 1) goTo(chapterIndex, storyIndex + 1);
    else if (chapterIndex < chapters.length - 1) goTo(chapterIndex + 1, 0);
  }

  function previous() {
    if (storyIndex > 0) goTo(chapterIndex, storyIndex - 1);
    else if (chapterIndex > 0)
      goTo(chapterIndex - 1, Math.max(0, (chapters[chapterIndex - 1]?.stories.length ?? 1) - 1));
  }

  if (state.kind === "loading") {
    return <p className="animate-pulse-soft p-8 text-center text-ink-muted">Loading your morning brief…</p>;
  }

  if (state.kind === "error") {
    return (
      <GlassCard className="mx-auto mt-16 max-w-md p-6 text-center" role="alert">
        <p className="font-display text-lg">{state.message}</p>
        <Button
          className="mt-4"
          onClick={() => {
            window.location.reload();
          }}
        >
          Try again
        </Button>
      </GlassCard>
    );
  }

  const { index } = state.brief;
  const isFirst = chapterIndex === 0 && storyIndex === 0;
  const isLast = chapterIndex === chapters.length - 1 && storyIndex === (chapter?.stories.length ?? 1) - 1;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-gradient-dawn font-display text-2xl font-bold tracking-tight">Dawn</h1>
          <p className="text-sm text-ink-muted">{dateFormat.format(new Date(`${index.date}T12:00:00`))}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          {index.sample && <Badge tone="sample">Sample data</Badge>}
          <span>
            Last updated{" "}
            <time dateTime={index.generatedAt}>{updatedFormat.format(new Date(index.generatedAt))}</time>
          </span>
        </div>
      </header>

      <nav
        aria-label="Chapters"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {chapters.map((c, i) => (
          <Chip
            key={c.scope}
            selected={i === chapterIndex}
            leading={c.flag}
            onClick={() => {
              goTo(i, 0);
            }}
          >
            {c.title}
          </Chip>
        ))}
      </nav>

      {chapter && (
        <ProgressBar
          segments={chapter.stories.length}
          active={storyIndex}
          progress={1}
          label={`${chapter.title} chapter progress`}
        />
      )}

      <main className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,26rem)_1fr_15rem] lg:items-start">
        <section aria-label="Story" className="lg:col-start-1 lg:row-start-1">
          <AnimatePresence mode="wait" initial={false}>
            {story && (
              <motion.div
                key={story.id}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <StoryCard story={story} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <div className="py-2 lg:col-start-2 lg:row-start-1 lg:py-10">
          <GlobePlaceholder
            label={story ? `Map of ${story.locations.map((l) => l.name).join(", ")}` : "Globe"}
          />
        </div>

        <aside
          aria-label="Pictures"
          className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0 lg:col-start-3 lg:row-start-1 lg:flex-col lg:overflow-visible"
        >
          {[0, 1].map((i) => (
            <GlassCard
              key={i}
              className="grid aspect-[4/3] w-60 shrink-0 snap-start place-items-center p-4 text-center text-xs text-ink-faint lg:w-full"
            >
              Licensed pictures arrive in Milestone 7
            </GlassCard>
          ))}
        </aside>
      </main>

      <GlassCard className="flex flex-col gap-2 p-4">
        <p className="text-xs font-semibold tracking-wider text-dawn-gold uppercase">{index.learn.title}</p>
        <p className="text-sm text-ink-muted">{index.learn.body}</p>
      </GlassCard>

      <footer className="glass sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] mx-auto flex w-fit items-center gap-3 rounded-full p-2">
        <Button variant="icon" aria-label="Previous story" onClick={previous} disabled={isFirst}>
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M6 5h2v14H6zM20 5v14L9 12z" />
          </svg>
        </Button>
        <Button
          variant="primary"
          aria-label="Play brief (coming in Milestone 5)"
          disabled
          className="size-14 justify-center p-0"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </Button>
        <Button variant="icon" aria-label="Next story" onClick={next} disabled={isLast}>
          <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
            <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
          </svg>
        </Button>
      </footer>
    </div>
  );
}
