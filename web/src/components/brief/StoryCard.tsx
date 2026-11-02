"use client";

import type { StoryEvent } from "@dawn/pipeline/schema";
import { motion, stagger, useReducedMotion, type Variants } from "motion/react";
import { Badge } from "@/components/ui/Badge";
import { Surface } from "@/components/ui/Surface";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export interface StoryCardProps {
  readonly story: StoryEvent;
  readonly chapterTitle: string;
  /** 1-based position and length of the chapter, for "1 of 2". */
  readonly position: number;
  readonly total: number;
  readonly onDeeper: () => void;
}

const container: Variants = {
  hidden: {},
  shown: { transition: { delayChildren: stagger(0.1, { startDelay: 0.1 }) } },
};
const item: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};

/**
 * Explanation card floating over the globe (top on phones, top-left on desktop).
 * The text settles in as the camera arrives; details live in "Go deeper".
 */
export function StoryCard({ story, chapterTitle, position, total, onDeeper }: StoryCardProps) {
  const reduce = useReducedMotion() ?? false;
  const places = story.locations.map((l) => l.name).join(", ");
  return (
    <Surface className="px-4 pt-3.5 pb-3" aria-live="polite">
      <motion.div variants={container} initial={reduce ? "shown" : "hidden"} animate="shown">
        <motion.div variants={item} className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-semibold text-ink">{chapterTitle}</span>
          <span className="text-ink-faint tabular-nums">
            {position} of {total}
          </span>
        </motion.div>
        <motion.h2
          variants={item}
          className="mt-2 font-serif text-[1.35rem] leading-[1.2] font-medium text-balance text-ink"
        >
          {story.headline}
        </motion.h2>
        <motion.p variants={item} className="mt-1.5 text-xs text-ink-faint">
          {places}, <time dateTime={story.time}>{timeFormat.format(new Date(story.time))}</time>
          {story.developing && (
            <span className="ml-2 align-middle">
              <Badge tone="developing">Developing</Badge>
            </span>
          )}
        </motion.p>
        <motion.p variants={item} className="mt-2.5 text-[0.94rem] leading-relaxed text-ink-muted">
          {story.summary}
        </motion.p>
        <motion.div
          variants={item}
          className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5"
        >
          <button
            type="button"
            onClick={onDeeper}
            className="-ml-1 min-h-10 rounded-lg px-1 text-sm font-semibold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Go deeper
          </button>
          <span className="text-xs text-ink-faint">AI summary of {story.sources.length} sources</span>
        </motion.div>
      </motion.div>
    </Surface>
  );
}
