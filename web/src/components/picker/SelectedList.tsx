"use client";

import { Reorder, useDragControls } from "motion/react";
import type { KeyboardEvent } from "react";
import { usePreferences } from "@/lib/preferences";
import { scopeInfo, type Scope } from "@/lib/selection";

/** "Your brief" — the chosen chapters in play order. Drag the handle (or use arrow keys) to reorder. */
export function SelectedList() {
  const selection = usePreferences((s) => s.selection);
  const reorder = usePreferences((s) => s.reorder);

  return (
    <div className="flex flex-col gap-1.5">
      {selection.length === 0 && (
        <p className="rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-ink-muted">
          Pick regions or countries below. They play in this order, then Global.
        </p>
      )}
      <Reorder.Group axis="y" values={[...selection]} onReorder={reorder} className="flex flex-col gap-1.5">
        {selection.map((scope, index) => (
          <SelectedRow key={scope} scope={scope} index={index} count={selection.length} />
        ))}
      </Reorder.Group>
      <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
        <span className="w-6 text-center text-lg" aria-hidden>
          🌍
        </span>
        <span className="flex-1 text-sm font-medium">Global</span>
        <span className="text-xs text-ink-faint">Always on · plays last</span>
      </div>
    </div>
  );
}

function SelectedRow({
  scope,
  index,
  count,
}: {
  readonly scope: Scope;
  readonly index: number;
  readonly count: number;
}) {
  const controls = useDragControls();
  const move = usePreferences((s) => s.move);
  const toggle = usePreferences((s) => s.toggle);
  const info = scopeInfo(scope);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      move(index, index - 1);
    } else if (e.key === "ArrowDown" && index < count - 1) {
      e.preventDefault();
      move(index, index + 1);
    }
  };

  return (
    <Reorder.Item
      value={scope}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-night-800/90 px-3 py-2 select-none"
      whileDrag={{ scale: 1.03, boxShadow: "0 12px 30px -10px rgb(0 0 0 / 0.7)" }}
    >
      <button
        type="button"
        aria-label={`Reorder ${info.title}, position ${index + 1} of ${count}. Use arrow keys.`}
        className="grid size-9 cursor-grab touch-none place-items-center rounded-xl text-ink-faint active:cursor-grabbing"
        onPointerDown={(e) => {
          controls.start(e);
        }}
        onKeyDown={onKeyDown}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      <span className="w-6 text-center text-lg" aria-hidden>
        {info.flag}
      </span>
      <span className="flex-1 text-sm font-medium">
        {info.title}
        <span className="ml-2 text-xs font-normal text-ink-faint">
          {info.kind === "region" ? "Region" : "Country"}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${info.title}`}
        className="grid size-9 place-items-center rounded-xl text-ink-faint hover:bg-white/10 hover:text-ink"
        onClick={() => {
          toggle(scope);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </Reorder.Item>
  );
}
