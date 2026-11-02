"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly children: ReactNode;
  /** "tall" covers almost the whole phone screen; "auto" fits the content. */
  readonly size?: "tall" | "auto";
  readonly className?: string;
}

/** Bottom sheet on phones, centered panel on wide screens. Escape or the backdrop closes it. */
export function Sheet({ open, onClose, title, children, size = "auto", className }: SheetProps) {
  const reduce = useReducedMotion() ?? false;
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            className={cn(
              "relative flex w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface outline-none sm:rounded-2xl sm:border",
              size === "tall" ? "h-[92dvh] sm:h-[85dvh]" : "max-h-[85dvh]",
              className,
            )}
            initial={reduce ? { opacity: 0 } : { y: "100%" }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: "100%" }}
            transition={reduce ? { duration: 0 } : { type: "spring", damping: 32, stiffness: 320 }}
          >
            <div
              className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden"
              aria-hidden
            />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
