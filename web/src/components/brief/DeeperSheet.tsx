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
          <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6">
            <p className="text-xs text-ink-faint capitalize">{story.topic}</p>
            <h2 className="mt-1 font-serif text-[1.6rem] leading-[1.15] font-medium text-balance">
              {story.headline}
            </h2>
            {story.developing && (
              <div className="mt-2">
                <Badge tone="developing">Developing story</Badge>
              </div>
            )}

            <Section title="Why it matters">
              <p className="text-ink">{story.whyItMatters}</p>
            </Section>

            {story.deeper ? (
              <>
                <Section title="How it started">
                  <p>{story.deeper.background}</p>
                </Section>
                {story.deeper.keyPlayers.length > 0 && (
                  <Section title="Key players">
                    <dl className="flex flex-col gap-2">
                      {story.deeper.keyPlayers.map((p) => (
                        <div key={p.name}>
                          <dt className="font-semibold text-ink">{p.name}</dt>
                          <dd>{p.role}</dd>
                        </div>
                      ))}
                    </dl>
                  </Section>
                )}
                <Section title="What could happen next">
                  <p>{story.deeper.whatNext}</p>
                </Section>
                {story.deeper.timeline.length > 0 && (
                  <Section title="Timeline">
                    <ol className="flex flex-col gap-3 border-l border-line-strong pl-4">
                      {story.deeper.timeline.map((t) => (
                        <li key={`${t.date}-${t.label}`} className="relative">
                          <span
                            className="absolute top-2 -left-[1.31rem] size-2 rounded-full border border-ink-muted bg-surface"
                            aria-hidden
                          />
                          <span className="block text-xs text-ink-faint">{t.date}</span>
                          {t.label}
                        </li>
                      ))}
                    </ol>
                  </Section>
                )}
                <Section title="In simpler words">
                  <p>{story.deeper.simpler}</p>
                </Section>
              </>
            ) : (
              <p className="mt-6 text-sm text-ink-faint">
                More background for this story will be written on request once the AI step is connected.
              </p>
            )}

            <Section title="Sources">
              <ul className="divide-y divide-line border-y border-line">
                {story.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between gap-3 py-3 hover:text-ink"
                    >
                      <span>
                        <span className="block text-sm font-semibold text-ink">{s.outlet}</span>
                        <span className="block text-xs text-ink-faint">{s.title}</span>
                      </span>
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4 shrink-0 text-ink-faint"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-label="Opens in a new tab"
                      >
                        <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-faint">
                This summary was written by AI from the sources above. Read them for the full story.
              </p>
            </Section>
          </div>
          <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button onClick={onClose} className="w-full justify-center py-3">
              Back to brief
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-1.5 text-sm font-semibold text-ink">{title}</h3>
      <div className="text-[0.95rem] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}
