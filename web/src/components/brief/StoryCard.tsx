"use client";

import type { StoryEvent } from "@dawn/pipeline/schema";
import { motion, stagger, useReducedMotion, type Variants } from "motion/react";
import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export interface StoryCardProps {
  readonly story: StoryEvent;
  /** e.g. "Europe · story 1 of 2" */
  readonly kicker: string;
  readonly onDeeper: () => void;
}

const container: Variants = {
  hidden: {},
  shown: { transition: { delayChildren: stagger(0.12, { startDelay: 0.15 }) } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
};

/**
 * Compact explanation card that floats over the globe (top on phones, top-left on desktop).
 * Lines fade in one after another as the camera arrives. Details live in "Go deeper".
 */
export function StoryCard({ story, kicker, onDeeper }: StoryCardProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <GlassCard className="bg-night-900/55 p-4" aria-live="polite">
      <motion.div
        className="flex flex-col gap-2"
        variants={container}
        initial={reduce ? "shown" : "hidden"}
        animate="shown"
      >
        <motion.p
          variants={item}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint"
        >
          <span className="font-semibold text-dawn-coral">{kicker}</span>
          <span aria-hidden>·</span>
          <time dateTime={story.time}>{timeFormat.format(new Date(story.time))}</time>
          <span aria-hidden>·</span>
          <span>{story.locations.map((l) => l.name).join(", ")}</span>
          {story.developing && <Badge tone="developing">Developing</Badge>}
        </motion.p>
        <motion.h2
          variants={item}
          className="font-display text-[1.15rem] leading-snug font-semibold text-balance"
        >
          {story.headline}
        </motion.h2>
        <motion.p variants={item} className="text-[0.92rem] leading-relaxed text-ink-muted">
          {story.summary}
        </motion.p>
        <motion.div variants={item} className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onDeeper}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-dawn-coral/50 bg-dawn-coral/15 px-4 text-sm font-medium text-ink transition active:scale-95"
          >
            Go deeper
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden
            >
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="text-[0.68rem] tracking-wide text-[#c9c1ff]/80 uppercase">
            AI summary · {story.sources.length} sources
          </span>
        </motion.div>
      </motion.div>
    </GlassCard>
  );
}
