import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** Solid floating panel used for cards over the globe. */
export function Surface({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("surface rounded-[var(--radius-card)]", className)} {...props} />;
}
