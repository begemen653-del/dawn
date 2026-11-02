"use client";

import { countriesInRegion, REGIONS, type SelectableRegionId } from "@dawn/config";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/preferences";
import { scopeInfo, searchCountries, type Scope } from "@/lib/selection";
import { SelectedList } from "./SelectedList";

export interface NewsPickerProps {
  readonly open: boolean;
  readonly firstRun: boolean;
  readonly onDone: () => void;
}

const SELECTABLE = REGIONS.filter((r) => r.id !== "global");
/** The most important regions start expanded; the rest stay collapsed to keep the list short. */
const OPEN_BY_DEFAULT = new Set<string>(["europe", "asia", "north-america"]);

/** "Choose your news": regions and countries in any mix, Global always included and last. */
export function NewsPicker({ open, firstRun, onDone }: NewsPickerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchCountries(deferredQuery), [deferredQuery]);
  const searching = deferredQuery.trim() !== "";

  return (
    <Sheet open={open} onClose={onDone} title="Choose your news" size="tall">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 pt-3 pb-4">
        <div>
          <h2 className="font-serif text-[1.6rem] leading-tight font-medium">
            {firstRun ? "What should your brief cover?" : "Choose your news"}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Your chapters play in this order. Global news always comes last.
          </p>
        </div>
        <Button variant="primary" onClick={onDone} className="mt-1 shrink-0">
          Done
        </Button>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <section aria-labelledby="order-heading" className="pt-4">
          <h3 id="order-heading" className="mb-2 text-sm font-semibold">
            Your brief
          </h3>
          <SelectedList />
        </section>

        <div className="sticky top-0 z-10 -mx-5 mt-5 border-b border-line bg-surface px-5 py-3">
          <label className="relative block">
            <span className="sr-only">Search countries</span>
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-ink-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search countries"
              autoComplete="off"
              enterKeyHint="search"
              className="h-11 w-full rounded-lg border border-line-strong bg-ground pr-3 pl-10 text-base text-ink placeholder:text-ink-faint focus:border-ink-muted focus:outline-none"
            />
          </label>
        </div>

        {searching ? (
          <section aria-label="Search results" className="pt-2">
            {results.length === 0 ? (
              <p className="py-6 text-sm text-ink-muted">
                No country matches “{deferredQuery}”. Try its English or local name.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {results.map((c) => (
                  <OptionRow key={c.iso2} scope={c.iso2} detail={scopeInfo(c.region).title} />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            <Group title="Regions" note="The most important stories from across a region.">
              <ul className="divide-y divide-line">
                {SELECTABLE.map((r) => (
                  <OptionRow key={r.id} scope={r.id} detail={r.blurb} />
                ))}
              </ul>
            </Group>

            <Group title="Countries" note="Stories about, or reported from, one country.">
              <div className="divide-y divide-line border-y border-line">
                {SELECTABLE.map((r) => (
                  <details key={r.id} open={OPEN_BY_DEFAULT.has(r.id)} className="group">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-sm font-semibold">
                      {r.name}
                      <svg
                        viewBox="0 0 24 24"
                        className="size-4 text-ink-faint transition-transform group-open:rotate-180"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </summary>
                    <ul className="pb-2">
                      {countriesInRegion(r.id as SelectableRegionId).map((c) => (
                        <OptionRow key={c.iso2} scope={c.iso2} compact />
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </Group>
          </>
        )}
      </div>
    </Sheet>
  );
}

function Group({
  title,
  note,
  children,
}: {
  readonly title: string;
  readonly note: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="pt-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-1 text-xs text-ink-faint">{note}</p>
      {children}
    </section>
  );
}

function OptionRow({
  scope,
  detail,
  compact = false,
}: {
  readonly scope: Scope;
  readonly detail?: string;
  readonly compact?: boolean;
}) {
  const selected = usePreferences((s) => s.selection.includes(scope));
  const toggle = usePreferences((s) => s.toggle);
  const info = scopeInfo(scope);
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        onClick={() => {
          toggle(scope);
        }}
        className={cn(
          "flex w-full items-center gap-3 text-left",
          compact ? "min-h-11 py-1" : "min-h-14 py-2",
        )}
      >
        {info.flag !== "" && (
          <span className="w-6 text-center text-lg leading-none" aria-hidden>
            {info.flag}
          </span>
        )}
        <span className="flex-1">
          <span className="block text-[0.95rem] text-ink">{info.title}</span>
          {detail !== undefined && <span className="block text-xs text-ink-faint">{detail}</span>}
        </span>
        <Checkbox checked={selected} />
      </button>
    </li>
  );
}

function Checkbox({ checked }: { readonly checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-[5px] border transition-colors",
        checked ? "border-ink bg-ink text-ground" : "border-line-strong",
      )}
    >
      {checked && (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3.2">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
