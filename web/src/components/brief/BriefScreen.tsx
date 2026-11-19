"use client";

import { getCountry, getRegion, type CameraView } from "@dawn/config";
import type { ImageAsset, Playlist, SceneDirective, StoryEvent } from "@dawn/pipeline/schema";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GlobeFocus } from "@/components/globe/CanvasGlobe";
import { Globe } from "@/components/globe/Globe";
import Link from "next/link";
import { NewsPicker } from "@/components/picker/NewsPicker";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Surface } from "@/components/ui/Surface";
import {
  BriefLoadError,
  briefAge,
  downloadBrief,
  loadPlaylists,
  readSavedBrief,
  type LoadedBrief,
} from "@/lib/brief";
import { buildChapters, buildSlides, type Chapter } from "@/lib/chapters";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/preferences";
import { chapterOrder, isRegionId } from "@/lib/selection";
import { useOnline } from "@/lib/use-online";
import { usePreferencesHydration } from "@/lib/use-preferences-hydration";
import { DeeperSheet } from "./DeeperSheet";
import { PictureSheet, PictureStrip } from "./Pictures";
import { StoryCard } from "./StoryCard";

interface PlaylistState {
  /** The brief these chapters belong to (its generatedAt). */
  readonly brief: string;
  readonly map: ReadonlyMap<string, Playlist>;
  readonly tried: ReadonlySet<string>;
}
const NO_PLAYLISTS: PlaylistState = { brief: "", map: new Map(), tried: new Set() };

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly brief: LoadedBrief };

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

/** How long a story stays while playing: the camera's flight plus time to read it (~200 words a minute). */
function storyDwellMs(story: StoryEvent | undefined): number {
  if (!story) return 3500;
  const words = `${story.headline} ${story.summary}`.split(/\s+/).length;
  return Math.min(24_000, Math.max(8000, 2500 + (words / 3.3) * 1000));
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
  const [picture, setPicture] = useState<ImageAsset | null>(null);

  const [update, setUpdate] = useState<LoadedBrief | null>(null);
  const online = useOnline();
  // Read by the loader without restarting it: whether the reader has started, and what's on screen.
  const startedReading = useRef(false);
  const shown = useRef<LoadedBrief | null>(null);
  const show = useCallback((brief: LoadedBrief) => {
    shown.current = brief;
    setLoad({ kind: "ready", brief });
  }, []);

  // 1. Show the brief saved on this phone at once. 2. Check online for a newer one and save it.
  // A newer brief replaces the screen only if the reader hasn't started yet; otherwise it waits
  // behind a "New brief" button. Checks again when the phone is back online or the app reopens.
  const [checks, setChecks] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!shown.current) {
        const saved = await readSavedBrief();
        if (controller.signal.aborted) return;
        if (saved) show(saved);
      }
      const before = shown.current;
      try {
        const fresh = await downloadBrief(before?.index ?? null, controller.signal, {
          onReady: (brief) => {
            if (!shown.current) show(brief);
          },
        });
        if (controller.signal.aborted || !fresh) return;
        const sameBrief = shown.current?.index.generatedAt === fresh.index.generatedAt;
        if (!before || sameBrief || !startedReading.current) {
          show(fresh);
          setUpdate(null);
        } else {
          setUpdate(fresh);
        }
      } catch (error: unknown) {
        if (controller.signal.aborted || shown.current) return;
        const message =
          error instanceof BriefLoadError ? error.message : "Something went wrong loading the brief.";
        setLoad({ kind: "error", message });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [checks, show]);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === "visible") setChecks((n) => n + 1);
    };
    window.addEventListener("online", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("online", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  // Chapters are separate files; load only the ones the reader chose (from the saved copy first).
  // `tried` lists chapters whose file was asked for, loaded or not: until every chosen chapter is
  // tried the brief shows "Loading", never a wrong "no news" card.
  const briefId = load.kind === "ready" ? load.brief.index.generatedAt : "";
  const [playlistState, setPlaylistState] = useState<PlaylistState>(NO_PLAYLISTS);
  const current = playlistState.brief === briefId ? playlistState : NO_PLAYLISTS;
  const wantedKey = chapterOrder(selection).join(",");
  const missingKey = wantedKey
    .split(",")
    .filter((scope) => !current.tried.has(scope))
    .join(",");
  const playlists = current.map;
  useEffect(() => {
    if (load.kind !== "ready" || missingKey === "") return;
    const missing = missingKey.split(",");
    const controller = new AbortController();
    void loadPlaylists(load.brief, missing, controller.signal).then((loaded) => {
      if (controller.signal.aborted) return;
      setPlaylistState((prev) => {
        const base = prev.brief === briefId ? prev : NO_PLAYLISTS;
        return {
          brief: briefId,
          map: new Map([...base.map, ...loaded.map((p) => [p.scope, p] as const)]),
          tried: new Set([...base.tried, ...missing]),
        };
      });
    });
    return () => {
      controller.abort();
    };
  }, [load, missingKey, briefId]);
  const chaptersReady = load.kind === "ready" && missingKey === "";

  // First run: open "Choose your news" once preferences are known.
  const showPicker = pickerOpen || (hydrated && !onboarded);

  const chapters = useMemo(
    () =>
      load.kind === "ready" && chaptersReady
        ? buildChapters(selection, {
            events: load.brief.events,
            playlists: [...playlists.values()],
            sample: load.brief.index.sample,
          })
        : [],
    [load, chaptersReady, selection, playlists],
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
  useEffect(() => {
    if (slideIndex > 0) startedReading.current = true;
  }, [slideIndex]);
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
    if (showPicker || deeper || picture) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") previous();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [showPicker, deeper, picture, next, previous]);

  // Play: each story stays for its camera flight plus reading time, then the next one comes.
  // Pauses while a sheet is open or the app is in the background; stops at the end.
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(1);
  const progressRef = useRef(1);
  const blocked = showPicker || deeper !== null || picture !== null;
  const dwellMs = slide ? storyDwellMs(slide.story ?? undefined) : 0;
  useEffect(() => {
    // A new story starts its bar from zero while playing, and shows full when not.
    progressRef.current = playing ? 0 : 1;
    setProgress(progressRef.current);
  }, [slideIndex, playing]);
  useEffect(() => {
    if (!playing || blocked || !slide) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Time only counts while the page is visible.
      if (!document.hidden) progressRef.current += (now - last) / dwellMs;
      last = now;
      if (progressRef.current >= 1) {
        progressRef.current = 1;
        setProgress(1);
        if (slideIndex + 1 >= slides.length) setPlaying(false);
        next();
        return;
      }
      setProgress(progressRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [playing, blocked, slide, dwellMs, slideIndex, slides.length, next]);
  const togglePlay = () => {
    if (!playing && atEnd) setSlideIndex(0);
    setPlaying((p) => !p);
  };

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

  const showUpdate = () => {
    if (!update) return;
    show(update);
    setUpdate(null);
    startedReading.current = false;
    setSlideIndex(0);
  };

  // "Today, 04:31" / "Yesterday, 04:31"; recomputed when the app is reopened (checks change).
  const generatedAt = load.kind === "ready" ? load.brief.index.generatedAt : null;
  const age = useMemo(
    () => (generatedAt ? briefAge(generatedAt) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `checks` marks "the app was reopened"
    [generatedAt, checks],
  );

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
        <Globe scene={scene} focus={focus} reducedMotion={reduceMotion} label={globeLabel} />
      </div>

      {/* Overlays. pointer-events only on the actual controls so the globe stays visible. */}
      <div className="pointer-events-none relative z-10 mx-auto flex h-full max-w-7xl flex-col px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <div ref={topRef} className="flex flex-col gap-2">
          {slides.length > 0 && (
            <ProgressBar
              segments={slides.length}
              active={Math.min(slideIndex, slides.length - 1)}
              progress={progress}
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

          {update && (
            <button
              type="button"
              onClick={showUpdate}
              className="pointer-events-auto flex items-center gap-2 self-start rounded-full border border-accent/40 bg-ground/85 px-3.5 py-1.5 text-xs text-ink backdrop-blur"
            >
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              New brief ready
              <span className="font-semibold text-accent">Show</span>
            </button>
          )}

          <div ref={cardRef} className="pointer-events-auto w-full lg:max-w-[25rem]">
            {(load.kind === "loading" || (load.kind === "ready" && !chaptersReady)) && (
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
          {slide?.story && slide.story.images.length > 0 && (
            <aside
              aria-label="Pictures"
              className="no-scrollbar pointer-events-auto -mx-3 flex snap-x gap-2 overflow-x-auto px-3 lg:absolute lg:top-28 lg:right-5 lg:mx-0 lg:w-52 lg:flex-col lg:px-0"
            >
              <PictureStrip images={slide.story.images} onOpen={setPicture} />
            </aside>
          )}

          <div className="pointer-events-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <p className="text-xs leading-tight text-ink-faint">
              {age && load.kind === "ready" && (
                <>
                  {load.brief.index.sample ? "Sample data" : online ? "Updated" : "Offline · saved"}
                  <br />
                  <span className={cn("tabular-nums", !age.fresh && "text-accent")}>{age.label}</span>
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
                aria-label={playing ? "Pause brief" : "Play brief"}
                aria-pressed={playing}
                onClick={togglePlay}
                disabled={slides.length === 0}
                className="size-14 justify-center p-0"
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
                  {playing ? <path d="M7 5h4v14H7zM13 5h4v14h-4z" /> : <path d="M8 5v14l11-7z" />}
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
            <Link
              href="/sources"
              prefetch={false}
              className="justify-self-end text-xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
            >
              Sources
            </Link>
          </div>
        </div>
      </div>

      <NewsPicker open={showPicker} firstRun={!onboarded} onDone={closePicker} />
      <PictureSheet
        image={picture}
        onClose={() => {
          setPicture(null);
        }}
      />
      <DeeperSheet
        story={deeper}
        onClose={() => {
          setDeeper(null);
        }}
      />
    </div>
  );
}
