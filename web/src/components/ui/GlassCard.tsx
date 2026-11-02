import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

/** Translucent blurred surface used for every card in Dawn. */
export function GlassCard({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("glass rounded-[var(--radius-card)]", className)} {...props} />;
}
