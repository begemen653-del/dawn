import type { StoryEvent } from "@dawn/pipeline/schema";
import { Badge } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** The explanation card (top left on desktop, top on phones). */
export function StoryCard({ story }: { readonly story: StoryEvent }) {
  return (
    <GlassCard className="flex flex-col gap-4 p-5 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{story.topic}</Badge>
        {story.developing && <Badge tone="developing">Developing</Badge>}
        <span className="text-xs text-ink-faint">
          <time dateTime={story.time}>{timeFormat.format(new Date(story.time))}</time>
          {" · "}
          {story.locations.map((l) => l.name).join(", ")}
        </span>
      </div>

      <h2 className="font-display text-xl leading-snug font-semibold text-balance sm:text-2xl">
        {story.headline}
      </h2>
      <p className="leading-relaxed text-ink-muted">{story.summary}</p>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="mb-1 text-xs font-semibold tracking-wider text-dawn-coral uppercase">Why it matters</p>
        <p className="text-sm leading-relaxed text-ink">{story.whyItMatters}</p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-wider text-ink-faint uppercase">Read the original</p>
        <ul className="flex flex-wrap gap-2">
          {story.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-ink-muted transition hover:bg-white/10 hover:text-ink"
              >
                {s.outlet} ↗
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <Badge tone="ai">AI-generated from these sources</Badge>
      </div>
    </GlassCard>
  );
}
