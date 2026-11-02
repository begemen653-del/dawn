import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "developing";

/** Small status tag. "Developing" carries a dot so it reads without relying on colour alone. */
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
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs",
        tone === "developing" ? "border-alert/40 text-alert" : "border-line-strong text-ink-muted",
      )}
    >
      {tone === "developing" && <span className="size-1.5 rounded-full bg-alert" aria-hidden />}
      {children}
    </span>
  );
}
