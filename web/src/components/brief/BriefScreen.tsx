"use client";

import { getCountry, getRegion, type CameraView } from "@dawn/config";
import type { Playlist, SceneDirective, StoryEvent } from "@dawn/pipeline/schema";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasGlobe, type GlobeFocus } from "@/components/globe/CanvasGlobe";
import { NewsPicker } from "@/components/picker/NewsPicker";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Surface } from "@/components/ui/Surface";
import { BriefLoadError, loadLatestBrief, loadPlaylists, type LoadedBrief } from "@/lib/brief";
import { buildChapters, buildSlides, type Chapter } from "@/lib/chapters";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/preferences";
import { chapterOrder, isRegionId } from "@/lib/selection";
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

  // Chapters are separate files; fetch only the ones the reader chose (and keep them).
  const [playlists, setPlaylists] = useState<ReadonlyMap<string, Playlist>>(new Map());
  const wantedKey = chapterOrder(selection).join(",");
  useEffect(() => {
    if (load.kind !== "ready") return;
    const missing = wantedKey.split(",").filter((scope) => !playlists.has(scope));
    if (missing.length === 0) return;
    const controller = new AbortController();
    void loadPlaylists(load.brief.index, missing, controller.signal).then((loaded) => {
      if (controller.signal.aborted || loaded.length === 0) return;
      setPlaylists((current) => new Map([...current, ...loaded.map((p) => [p.scope, p] as const)]));
    });
    return () => {
      controller.abort();
    };
  }, [load, wantedKey, playlists]);

  // First run: open "Choose your news" once preferences are known.
  const showPicker = pickerOpen || (hydrated && !onboarded);

  const chapters = useMemo(
    () =>
      load.kind === "ready"
        ? buildChapters(selection, {
            events: load.brief.events,
            playlists: [...playlists.values()],
            sample: load.brief.index.sample,
          })
        : [],
    [load, selection, playlists],
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
      const obstacles = [top, bottom, card]
        .filter((r) => r !== undefined)
        .map((r) => [r.left, r.top, r.width, r.height] as const);
      if (wide && card) {
        setFocus({ x: (card.right + window.innerWidth) / 2, y: window.innerHeight / 2, obstacles });
      } else if (top && bottom) {
        setFocus({ x: window.innerWidth / 2, y: (top.bottom + bottom.top) / 2, obstacles });
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
    <div className="relative h-dvh overflow-hidden bg-ground">
      <div className="absolute inset-0">
        <CanvasGlobe scene={scene} focus={focus} reducedMotion={reduceMotion} label={globeLabel} />
      </div>

      {/* Overlays. pointer-events only on the actual controls so the globe stays visible. */}
      <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-7xl flex-col px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <div ref={topRef} className="flex flex-col gap-2">
          {slides.length > 0 && (
            <ProgressBar
              segments={slides.length}
              active={Math.min(slideIndex, slides.length - 1)}
              progress={1}
              label="Brief progress"
            />
          )}

          <div className="pointer-events-auto flex items-center gap-1">
            <nav aria-label="Chapters" className="no-scrollbar -ml-2 flex flex-1 overflow-x-auto">
              {chapters.map((c, i) => {
                const current = !atEnd && slide?.chapterIndex === i;
                return (
                  <button
                    key={c.scope}
                    type="button"
                    aria-current={current ? "step" : undefined}
                    onClick={() => {
                      jumpToChapter(i);
                    }}
                    className={cn(
                      "relative flex h-10 shrink-0 items-center gap-1.5 px-2 text-sm transition-colors",
                      current ? "font-semibold text-ink" : "text-ink-faint hover:text-ink-muted",
                    )}
                  >
                    {c.flag !== "" && <span aria-hidden>{c.flag}</span>}
                    {c.title}
                    {current && <span className="absolute inset-x-2 bottom-1 h-px bg-ink" aria-hidden />}
                  </button>
                );
              })}
            </nav>
            <button
              type="button"
              aria-label="Choose your news"
              onClick={() => {
                setPickerOpen(true);
              }}
              className="grid size-10 shrink-0 place-items-center rounded-full text-ink-muted hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
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
              <div className="py-3 text-sm text-ink-muted" role="status">
                <p>Loading today&apos;s brief…</p>
                <p className="slow-load-hint mt-1 text-xs text-ink-faint">
                  This is taking longer than usual. Check your connection, then reload the page.
                </p>
              </div>
            )}
            {load.kind === "error" && (
              <Surface className="p-4" role="alert">
                <p className="font-serif text-lg">{load.message}</p>
                <Button
                  className="mt-3"
                  onClick={() => {
                    window.location.reload();
                  }}
                >
                  Reload
                </Button>
              </Surface>
            )}
            <AnimatePresence mode="wait" initial={false}>
              {slide && chapter && (
                <motion.div
                  key={`${slide.chapterIndex}-${slide.story?.id ?? "empty"}`}
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.2 }}
                >
                  {slide.story ? (
                    <StoryCard
                      story={slide.story}
                      chapterTitle={chapter.title}
                      position={slide.position + 1}
                      total={slide.chapterLength}
                      onDeeper={() => {
                        setDeeper(slide.story);
                      }}
                    />
                  ) : (
                    <Surface className="px-4 py-3.5">
                      <p className="text-xs font-semibold">{chapter.title}</p>
                      <p className="mt-1.5 text-sm text-ink-muted">{chapter.emptyReason}</p>
                    </Surface>
                  )}
                </motion.div>
              )}
              {atEnd && load.kind === "ready" && (
                <motion.div
                  key="end"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <Surface className="px-4 pt-3.5 pb-4">
                    <p className="font-serif text-[1.35rem] font-medium">You&apos;re up to date.</p>
                    <div className="mt-3 border-t border-line pt-3">
                      <p className="text-sm font-semibold">{load.brief.index.learn.title}</p>
                      <p className="mt-1 text-[0.94rem] leading-relaxed text-ink-muted">
                        {load.brief.index.learn.body}
                      </p>
                    </div>
                    <Button
                      className="mt-4"
                      onClick={() => {
                        setSlideIndex(0);
                      }}
                    >
                      Play again
                    </Button>
                  </Surface>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1" />

        <div ref={bottomRef} className="flex flex-col gap-3">
          {slide?.story && (
            <aside
              aria-label="Pictures"
              className="no-scrollbar pointer-events-auto -mx-3 flex snap-x gap-2 overflow-x-auto px-3 lg:absolute lg:top-28 lg:right-5 lg:mx-0 lg:w-48 lg:flex-col lg:px-0"
            >
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="grid h-16 w-28 shrink-0 snap-start place-items-center rounded-lg border border-dashed border-line-strong bg-ground/70 p-2 text-center text-[0.7rem] leading-snug text-ink-faint lg:h-28 lg:w-full"
                >
                  Licensed photo
                </div>
              ))}
            </aside>
          )}

          <div className="pointer-events-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <p className="text-xs leading-tight text-ink-faint">
              {load.kind === "ready" && (
                <>
                  {load.brief.index.sample ? "Sample data" : "Updated"}
                  <br />
                  <span className="tabular-nums">
                    {updatedFormat.format(new Date(load.brief.index.generatedAt))}
                  </span>
                </>
              )}
            </p>
            <div className="flex items-center gap-3">
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
                aria-label="Play brief (available in a later milestone)"
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
            <span aria-hidden />
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
