"use client";

import { getCountry, getRegion, type CameraView } from "@dawn/config";
import type { SceneDirective, StoryEvent } from "@dawn/pipeline/schema";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasGlobe, type GlobeFocus } from "@/components/globe/CanvasGlobe";
import { NewsPicker } from "@/components/picker/NewsPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { BriefLoadError, loadLatestBrief, type LoadedBrief } from "@/lib/brief";
import { buildChapters, buildSlides, type Chapter } from "@/lib/chapters";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/preferences";
import { isRegionId } from "@/lib/selection";
import { usePreferencesHydration } from "@/lib/use-preferences-hydration";
import { DeeperSheet } from "./DeeperSheet";
import { StoryCard } from "./StoryCard";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly brief: LoadedBrief };

const updatedFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Scene for a chapter without stories: show the place itself. */
function placeScene(chapter: Chapter): SceneDirective {
  const country = isRegionId(chapter.scope) ? undefined : getCountry(chapter.scope);
  const camera: CameraView =
    country?.camera ?? getRegion(isRegionId(chapter.scope) ? chapter.scope : "global").camera;
  return {
    camera: { lng: camera.lng, lat: camera.lat, zoom: camera.zoom },
    elements: country ? [{ type: "highlight", id: "place", country: country.iso2, tone: "neutral" }] : [],
  };
}

/**
 * The brief: a full-screen globe with the story card floating on top and controls at the bottom.
 * Built for phones first; on wide screens the card moves to the top-left and pictures to the right.
 */
export function BriefScreen() {
  const hydrated = usePreferencesHydration();
  const selection = usePreferences((s) => s.selection);
  const onboarded = usePreferences((s) => s.onboarded);
  const completeOnboarding = usePreferences((s) => s.completeOnboarding);
  const reduceMotion = useReducedMotion() ?? false;

  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [deeper, setDeeper] = useState<StoryEvent | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadLatestBrief(controller.signal)
      .then((brief) => {
        setLoad({ kind: "ready", brief });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          error instanceof BriefLoadError ? error.message : "Something went wrong loading the brief.";
        setLoad({ kind: "error", message });
      });
    return () => {
      controller.abort();
    };
  }, []);

  // First run: open "Choose your news" once preferences are known.
  const showPicker = pickerOpen || (hydrated && !onboarded);

  const chapters = useMemo(
    () =>
      load.kind === "ready"
        ? buildChapters(selection, {
            events: load.brief.events,
            playlists: load.brief.playlists,
            sample: load.brief.index.sample,
          })
        : [],
    [load, selection],
  );
  const slides = useMemo(() => buildSlides(chapters), [chapters]);

  // Position in the brief; changing the selection starts again from the top.
  const selectionKey = selection.join(",");
  const [position, setPosition] = useState({ key: selectionKey, index: 0 });
  const slideIndex = position.key === selectionKey ? position.index : 0;
  const setSlideIndex = useCallback(
    (update: number | ((i: number) => number)) => {
      setPosition((p) => {
        const current = p.key === selectionKey ? p.index : 0;
        return { key: selectionKey, index: typeof update === "function" ? update(current) : update };
      });
    },
    [selectionKey],
  );
  const atEnd = slides.length > 0 && slideIndex >= slides.length;
  const slide = atEnd ? undefined : slides[Math.min(slideIndex, slides.length - 1)];
  const chapter = slide ? chapters[slide.chapterIndex] : undefined;

  const scene = useMemo<SceneDirective | null>(() => {
    if (!slide || !chapter) return null;
    return slide.story ? slide.story.scene : placeScene(chapter);
  }, [slide, chapter]);

  const next = useCallback(() => {
    setSlideIndex((i) => Math.min(i + 1, slides.length));
  }, [slides.length, setSlideIndex]);
  const previous = useCallback(() => {
    setSlideIndex((i) => Math.max(0, i - 1));
  }, [setSlideIndex]);
  const jumpToChapter = (index: number) => {
    const target = slides.findIndex((s) => s.chapterIndex === index);
    if (target >= 0) setSlideIndex(target);
  };

  // Keyboard: arrows move through the brief (when no sheet is open).
  useEffect(() => {
    if (showPicker || deeper) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") previous();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [showPicker, deeper, next, previous]);

  // Keep the story's location centered in the space between the card and the controls.
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<GlobeFocus | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const top = topRef.current?.getBoundingClientRect();
      const bottom = bottomRef.current?.getBoundingClientRect();
      const card = cardRef.current?.getBoundingClientRect();
      const wide = window.innerWidth >= 1024;
      if (wide && card) {
        setFocus({ x: (card.right + window.innerWidth) / 2, y: window.innerHeight / 2 });
      } else if (top && bottom) {
        setFocus({ x: window.innerWidth / 2, y: (top.bottom + bottom.top) / 2 });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const el of [topRef.current, bottomRef.current, cardRef.current]) if (el) observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [load.kind]);

  const closePicker = () => {
    completeOnboarding();
    setPickerOpen(false);
  };

  const globeLabel = slide?.story
    ? `Globe showing ${slide.story.locations.map((l) => l.name).join(", ")}`
    : chapter
      ? `Globe showing ${chapter.title}`
      : "Globe";

  return (
    <div className="relative h-dvh overflow-hidden">
      <div className="absolute inset-0">
        <CanvasGlobe scene={scene} focus={focus} reducedMotion={reduceMotion} label={globeLabel} />
      </div>

      {/* Overlays. pointer-events only on the actual controls so the globe stays visible. */}
      <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-7xl flex-col px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <div ref={topRef} className="flex flex-col gap-2.5">
          {slides.length > 0 && (
            <ProgressBar
              segments={slides.length}
              active={Math.min(slideIndex, slides.length - 1)}
              progress={1}
              label="Brief progress"
            />
          )}

          <div className="pointer-events-auto flex items-center gap-2">
            <nav aria-label="Chapters" className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
              {chapters.map((c, i) => (
                <button
                  key={c.scope}
                  type="button"
                  aria-current={!atEnd && slide?.chapterIndex === i ? "step" : undefined}
                  onClick={() => {
                    jumpToChapter(i);
                  }}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[0.8rem] backdrop-blur-md transition",
                    !atEnd && slide?.chapterIndex === i
                      ? "border-dawn-coral/60 bg-dawn-coral/20 text-ink"
                      : "border-white/10 bg-night-900/50 text-ink-muted",
                  )}
                >
                  <span aria-hidden>{c.flag}</span>
                  {c.title}
                </button>
              ))}
            </nav>
            <button
              type="button"
              aria-label="Choose your news"
              onClick={() => {
                setPickerOpen(true);
              }}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-night-900/50 text-ink backdrop-blur-md transition active:scale-95"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8" strokeLinecap="round" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="10" cy="17" r="2" />
              </svg>
            </button>
          </div>

          <div ref={cardRef} className="pointer-events-auto w-full lg:max-w-[25rem]">
            {load.kind === "loading" && (
              <p className="animate-pulse-soft py-4 text-center text-sm text-ink-muted">
                Loading your morning brief…
              </p>
            )}
            {load.kind === "error" && (
              <GlassCard className="p-4 text-center" role="alert">
                <p className="font-display">{load.message}</p>
                <Button
                  className="mt-3"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  Try again
                </Button>
              </GlassCard>
            )}
            <AnimatePresence mode="wait" initial={false}>
              {slide && chapter && (
                <motion.div
                  key={`${slide.chapterIndex}-${slide.story?.id ?? "empty"}`}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.25 }}
                >
                  {slide.story ? (
                    <StoryCard
                      story={slide.story}
                      kicker={`${chapter.title} · ${slide.position + 1} of ${slide.chapterLength}`}
                      onDeeper={() => {
                        setDeeper(slide.story);
                      }}
                    />
                  ) : (
                    <GlassCard className="bg-night-900/55 p-4">
                      <p className="text-xs font-semibold text-dawn-coral">{chapter.title}</p>
                      <p className="mt-1 text-sm text-ink-muted">{chapter.emptyReason}</p>
                    </GlassCard>
                  )}
                </motion.div>
              )}
              {atEnd && load.kind === "ready" && (
                <motion.div
                  key="end"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <GlassCard className="bg-night-900/55 p-4">
                    <p className="text-gradient-dawn font-display text-lg font-semibold">
                      That&apos;s your brief ☀️
                    </p>
                    <p className="mt-3 text-xs font-semibold tracking-wider text-dawn-gold uppercase">
                      {load.brief.index.learn.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      {load.brief.index.learn.body}
                    </p>
                    <Button
                      className="mt-3"
                      onClick={() => {
                        setSlideIndex(0);
                      }}
                    >
                      ↺ Start again
                    </Button>
                  </GlassCard>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1" />

        <div ref={bottomRef} className="flex flex-col gap-2.5">
          {slide?.story && (
            <aside
              aria-label="Pictures"
              className="no-scrollbar pointer-events-auto -mx-3 flex snap-x gap-2 overflow-x-auto px-3 lg:absolute lg:top-24 lg:right-5 lg:mx-0 lg:w-48 lg:flex-col lg:px-0"
            >
              {[0, 1].map((i) => (
                <motion.div
                  key={`${slide.story?.id ?? ""}-${i}`}
                  initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.9 + i * 0.25, duration: 0.5 }}
                  className="glass grid h-16 w-28 shrink-0 snap-start place-items-center rounded-2xl bg-night-900/50 p-2 text-center text-[0.68rem] text-ink-faint lg:h-28 lg:w-full"
                >
                  Licensed pictures arrive in Milestone 7
                </motion.div>
              ))}
            </aside>
          )}

          <div className="pointer-events-auto flex items-center justify-between gap-3">
            <p className="w-24 text-[0.68rem] leading-tight text-ink-faint">
              {load.kind === "ready" && (
                <>
                  {load.brief.index.sample && (
                    <span className="mb-0.5 block">
                      <Badge tone="sample">Sample</Badge>
                    </span>
                  )}
                  Updated {updatedFormat.format(new Date(load.brief.index.generatedAt))}
                </>
              )}
            </p>
            <div className="glass flex items-center gap-2 rounded-full bg-night-900/50 p-1.5">
              <Button
                variant="icon"
                aria-label="Previous story"
                onClick={previous}
                disabled={slideIndex === 0}
              >
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
              <Button
                variant="icon"
                aria-label="Next story"
                onClick={next}
                disabled={atEnd || slides.length === 0}
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                  <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
                </svg>
              </Button>
            </div>
            <span className="w-24" aria-hidden />
          </div>
        </div>
      </div>

      <NewsPicker open={showPicker} firstRun={!onboarded} onDone={closePicker} />
      <DeeperSheet
        story={deeper}
        onClose={() => {
          setDeeper(null);
        }}
      />
    </div>
  );
}
