import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink px-5 py-2.5 font-semibold text-ground hover:bg-white",
  secondary: "border border-line-strong px-4 py-2 text-ink hover:bg-raised",
  icon: "size-11 justify-center border border-line-strong text-ink hover:bg-raised",
};

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  readonly variant?: Variant;
}

export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center gap-2 rounded-full text-sm transition-colors duration-150 disabled:pointer-events-none disabled:opacity-35",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
