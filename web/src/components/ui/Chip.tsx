import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ChipProps extends ComponentPropsWithoutRef<"button"> {
  readonly selected?: boolean;
  readonly leading?: ReactNode;
}

/** Pill used for chapters, regions and countries. */
export function Chip({
  selected = false,
  leading,
  className,
  children,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm transition duration-200",
        selected
          ? "border-dawn-coral/60 bg-dawn-coral/15 text-ink shadow-[var(--shadow-glow)]"
          : "border-white/10 bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink",
        className,
      )}
      {...props}
    >
      {leading !== undefined && <span aria-hidden>{leading}</span>}
      {children}
    </button>
  );
}
