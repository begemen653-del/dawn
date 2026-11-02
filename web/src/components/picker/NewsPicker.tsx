"use client";

import { countriesInRegion, REGIONS, type Country, type SelectableRegionId } from "@dawn/config";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cn } from "@/lib/cn";
import { usePreferences } from "@/lib/preferences";
import { scopeInfo, searchCountries } from "@/lib/selection";
import { SelectedList } from "./SelectedList";

export interface NewsPickerProps {
  readonly open: boolean;
  readonly firstRun: boolean;
  readonly onDone: () => void;
}

const SELECTABLE = REGIONS.filter((r) => r.id !== "global");
/** Most important regions open first, the rest stay collapsed to keep the list short. */
const OPEN_BY_DEFAULT = new Set<SelectableRegionId>(["europe", "asia", "north-america"]);

/** "Choose your news": regions and countries in any mix, Global always included and last. */
export function NewsPicker({ open, firstRun, onDone }: NewsPickerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => searchCountries(deferredQuery), [deferredQuery]);
  const searching = deferredQuery.trim() !== "";

  return (
    <Sheet open={open} onClose={onDone} title="Choose your news" size="tall">
      <header className="flex items-start justify-between gap-3 px-5 pt-3 pb-3">
        <div>
          <h2 className="font-display text-xl font-semibold">
            {firstRun ? "Welcome to Dawn" : "Choose your news"}
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {firstRun
              ? "Pick the places you care about. Your brief plays them in order, then Global."
              : "Tap to add or remove. Drag to change the order."}
          </p>
        </div>
        <Button variant="primary" onClick={onDone} className="shrink-0">
          Done
        </Button>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <section aria-labelledby="order-heading" className="mb-5">
          <h3
            id="order-heading"
            className="mb-2 text-xs font-semibold tracking-wider text-ink-faint uppercase"
          >
            Your brief, in order
          </h3>
          <SelectedList />
        </section>

        <div className="sticky top-0 z-10 -mx-5 mb-4 bg-night-900/95 px-5 py-2 backdrop-blur">
          <label className="relative block">
            <span className="sr-only">Search countries</span>
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-faint"
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
              placeholder="Search: Germany, Almanya, USA…"
              autoComplete="off"
              enterKeyHint="search"
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/5 pr-4 pl-11 text-base text-ink placeholder:text-ink-faint focus:border-dawn-coral/60 focus:outline-none"
            />
          </label>
        </div>

        {searching ? (
          <section aria-label="Search results">
            {results.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-muted">No country matches “{deferredQuery}”.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {results.map((c) => (
                  <CountryRow key={c.iso2} country={c} showRegion />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            <section aria-labelledby="regions-heading" className="mb-6">
              <h3
                id="regions-heading"
                className="mb-2 text-xs font-semibold tracking-wider text-ink-faint uppercase"
              >
                Regions · top stories from the whole region
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {SELECTABLE.map((r) => (
                  <RegionTile key={r.id} id={r.id as SelectableRegionId} blurb={r.blurb} />
                ))}
              </div>
            </section>

            <section aria-labelledby="countries-heading">
              <h3
                id="countries-heading"
                className="mb-2 text-xs font-semibold tracking-wider text-ink-faint uppercase"
              >
                Countries · stories about or from that country
              </h3>
              <div className="flex flex-col gap-2">
                {SELECTABLE.map((r) => (
                  <details
                    key={r.id}
                    open={OPEN_BY_DEFAULT.has(r.id as SelectableRegionId)}
                    className="group rounded-2xl border border-white/10 bg-white/[0.03]"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
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
                    <ul className="flex flex-col gap-0.5 px-2 pb-2">
                      {countriesInRegion(r.id as SelectableRegionId).map((c) => (
                        <CountryRow key={c.iso2} country={c} />
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Sheet>
  );
}

function RegionTile({ id, blurb }: { readonly id: SelectableRegionId; readonly blurb: string }) {
  const selected = usePreferences((s) => s.selection.includes(id));
  const toggle = usePreferences((s) => s.toggle);
  const info = scopeInfo(id);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => {
        toggle(id);
      }}
      className={cn(
        "flex min-h-20 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition duration-200 active:scale-[0.98]",
        selected
          ? "border-dawn-coral/60 bg-dawn-coral/15 shadow-[var(--shadow-glow)]"
          : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]",
      )}
    >
      <span className="flex w-full items-center justify-between text-sm font-semibold">
        <span>
          <span aria-hidden>{info.flag}</span> {info.title}
        </span>
        <Check on={selected} />
      </span>
      <span className="text-xs leading-snug text-ink-faint">{blurb}</span>
    </button>
  );
}

function CountryRow({
  country,
  showRegion = false,
}: {
  readonly country: Country;
  readonly showRegion?: boolean;
}) {
  const selected = usePreferences((s) => s.selection.includes(country.iso2));
  const toggle = usePreferences((s) => s.toggle);
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => {
          toggle(country.iso2);
        }}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left transition",
          selected ? "bg-dawn-coral/12" : "hover:bg-white/[0.06]",
        )}
      >
        <span className="w-6 text-center text-lg" aria-hidden>
          {country.flag}
        </span>
        <span className="flex-1 text-sm">
          {country.name}
          {showRegion && (
            <span className="ml-2 text-xs text-ink-faint">{scopeInfo(country.region).title}</span>
          )}
        </span>
        <Check on={selected} />
      </button>
    </li>
  );
}

function Check({ on }: { readonly on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border transition",
        on ? "bg-gradient-dawn border-transparent text-night-950" : "border-white/20",
      )}
    >
      {on && (
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
