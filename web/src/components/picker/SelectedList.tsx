"use client";

import { Reorder, useDragControls } from "motion/react";
import type { KeyboardEvent } from "react";
import { usePreferences } from "@/lib/preferences";
import { scopeInfo, type Scope } from "@/lib/selection";

/** "Your brief": the chosen chapters in play order. Drag the handle (or use arrow keys) to reorder. */
export function SelectedList() {
  const selection = usePreferences((s) => s.selection);
  const reorder = usePreferences((s) => s.reorder);

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {selection.length === 0 && (
        <p className="border-b border-line px-3 py-3 text-sm text-ink-muted">
          Nothing chosen yet. Add regions or countries below.
        </p>
      )}
      <Reorder.Group axis="y" values={[...selection]} onReorder={reorder} className="divide-y divide-line">
        {selection.map((scope, index) => (
          <SelectedRow key={scope} scope={scope} index={index} count={selection.length} />
        ))}
      </Reorder.Group>
      <div
        className={
          selection.length > 0
            ? "flex min-h-12 items-center gap-3 border-t border-line px-3"
            : "flex min-h-12 items-center gap-3 px-3"
        }
      >
        <span className="w-9" aria-hidden />
        <span className="flex-1 text-[0.95rem]">Global</span>
        <span className="text-xs text-ink-faint">Always last</span>
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
      className="flex min-h-12 items-center gap-3 bg-surface px-3 select-none"
      whileDrag={{ backgroundColor: "#1e2631", boxShadow: "0 10px 24px -12px rgb(0 0 0 / 0.8)" }}
    >
      <button
        type="button"
        aria-label={`Move ${info.title}, position ${index + 1} of ${count}. Use the arrow keys.`}
        className="grid size-9 cursor-grab touch-none place-items-center rounded-md text-ink-faint active:cursor-grabbing"
        onPointerDown={(e) => {
          controls.start(e);
        }}
        onKeyDown={onKeyDown}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M5 9h14M5 15h14" strokeLinecap="round" />
        </svg>
      </button>
      {info.flag !== "" && (
        <span className="w-6 text-center text-lg leading-none" aria-hidden>
          {info.flag}
        </span>
      )}
      <span className="flex-1 text-[0.95rem]">{info.title}</span>
      <button
        type="button"
        aria-label={`Remove ${info.title}`}
        className="grid size-9 place-items-center rounded-md text-ink-faint hover:text-ink"
        onClick={() => {
          toggle(scope);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </Reorder.Item>
  );
}
