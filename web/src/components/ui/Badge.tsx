import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "ai" | "developing" | "sample";

const TONES: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/5 text-ink-muted",
  ai: "border-dawn-violet/40 bg-dawn-violet/10 text-[#c9c1ff]",
  developing: "border-alert/40 bg-alert/10 text-[#ffb3b3]",
  sample: "border-dawn-gold/40 bg-dawn-gold/10 text-dawn-gold",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  readonly tone?: Tone;
  readonly children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-[0.7rem] font-medium tracking-wider uppercase",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
