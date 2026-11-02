"use client";

import type { StoryEvent } from "@dawn/pipeline/schema";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

export interface DeeperSheetProps {
  readonly story: StoryEvent | null;
  readonly onClose: () => void;
}

/** "Go deeper": background, players, outlook, timeline, a simpler version and every source. */
export function DeeperSheet({ story, onClose }: DeeperSheetProps) {
  return (
    <Sheet open={story !== null} onClose={onClose} title="Go deeper" size="tall">
      {story && (
        <>
          <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge>{story.topic}</Badge>
              {story.developing && <Badge tone="developing">Developing</Badge>}
            </div>
            <h2 className="mb-4 font-display text-xl leading-snug font-semibold text-balance">
              {story.headline}
            </h2>

            <Section title="Why it matters" accent>
              <p>{story.whyItMatters}</p>
            </Section>

            {story.deeper ? (
              <>
                <Section title="How it started">
                  <p>{story.deeper.background}</p>
                </Section>
                {story.deeper.keyPlayers.length > 0 && (
                  <Section title="Key players">
                    <ul className="flex flex-col gap-1.5">
                      {story.deeper.keyPlayers.map((p) => (
                        <li key={p.name}>
                          <span className="font-medium text-ink">{p.name}</span> — {p.role}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                <Section title="What could happen next">
                  <p>{story.deeper.whatNext}</p>
                </Section>
                {story.deeper.timeline.length > 0 && (
                  <Section title="Timeline">
                    <ol className="relative flex flex-col gap-3 border-l border-white/15 pl-4">
                      {story.deeper.timeline.map((t) => (
                        <li key={`${t.date}-${t.label}`}>
                          <span
                            className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-dawn-coral"
                            aria-hidden
                          />
                          <span className="block text-xs text-ink-faint">{t.date}</span>
                          {t.label}
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}
                <Section title="Explain it even simpler">
                  <p>{story.deeper.simpler}</p>
                </Section>
              </>
            ) : (
              <p className="mb-5 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-ink-muted">
                More background for this story will be written on demand (coming with the AI milestone).
              </p>
            )}

            <Section title="Read the original">
              <ul className="flex flex-col gap-2">
                {story.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 transition hover:bg-white/[0.08]"
                    >
                      <span>
                        <span className="block text-sm font-medium text-ink">{s.outlet}</span>
                        <span className="block text-xs text-ink-faint">{s.title}</span>
                      </span>
                      <span aria-hidden>↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>

            <Badge tone="ai">AI-generated from these sources</Badge>
          </div>
          <div className="border-t border-white/10 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button variant="ghost" onClick={onClose} className="w-full justify-center py-3">
              ← Back to brief
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Section({
  title,
  accent = false,
  children,
}: {
  readonly title: string;
  readonly accent?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3
        className={
          accent
            ? "mb-1.5 text-xs font-semibold tracking-wider text-dawn-coral uppercase"
            : "mb-1.5 text-xs font-semibold tracking-wider text-ink-faint uppercase"
        }
      >
        {title}
      </h3>
      <div className="text-[0.95rem] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}
