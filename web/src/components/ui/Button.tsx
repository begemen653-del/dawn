import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-dawn px-5 py-2.5 text-night-950 font-semibold shadow-[var(--shadow-glow)] hover:brightness-110",
  ghost: "glass px-4 py-2 text-ink hover:bg-white/10",
  icon: "glass size-12 justify-center text-ink hover:bg-white/10",
};

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  readonly variant?: Variant;
}

export function Button({ variant = "ghost", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-2 rounded-[var(--radius-pill)] text-sm transition duration-200 ease-[var(--ease-out-soft)] active:scale-95 disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
