import {
  COUNTRIES,
  getCountry,
  getRegion,
  REGION_IDS,
  type Country,
  type RegionId,
  type SelectableRegionId,
} from "@dawn/config";

/** A chapter scope chosen by the user: a region id or a country ISO2 code. Never "global". */
export type Scope = SelectableRegionId | (string & {});

export const GLOBAL = "global" as const;

export function isRegionId(scope: string): scope is RegionId {
  return (REGION_IDS as readonly string[]).includes(scope);
}

/** Keeps only known, unique scopes, in order. Global is implied, so it is dropped. */
export function normalizeSelection(raw: unknown): Scope[] {
  if (!Array.isArray(raw)) return [];
  const out: Scope[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item === GLOBAL || out.includes(item)) continue;
    if (isRegionId(item) || getCountry(item)?.iso2 === item) out.push(item);
  }
  return out;
}

/** Adds the scope at the end, or removes it if already chosen. */
export function toggleScope(selection: readonly Scope[], scope: Scope): Scope[] {
  if (scope === GLOBAL) return [...selection];
  return selection.includes(scope) ? selection.filter((s) => s !== scope) : [...selection, scope];
}

export function moveScope(selection: readonly Scope[], from: number, to: number): Scope[] {
  if (from === to || from < 0 || from >= selection.length) return [...selection];
  const next = [...selection];
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...selection];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/** The order chapters play in: the user's order, Global always last. */
export function chapterOrder(selection: readonly Scope[]): string[] {
  return [...selection.filter((s) => s !== GLOBAL), GLOBAL];
}

export interface ScopeInfo {
  readonly scope: string;
  readonly kind: "region" | "country";
  readonly title: string;
  readonly flag: string;
}

export function scopeInfo(scope: string): ScopeInfo {
  if (isRegionId(scope)) {
    // Regions carry no icon; only countries show their flag.
    return { scope, kind: "region", title: getRegion(scope).name, flag: "" };
  }
  const country = getCountry(scope);
  return { scope, kind: "country", title: country?.name ?? scope, flag: country?.flag ?? "📍" };
}

/** Lowercase and strip accents, so "turkiye" finds "Türkiye". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Countries matching a search, best matches first (name start, alias start, then contains). */
export function searchCountries(query: string, limit = 40): Country[] {
  const q = fold(query);
  if (q === "") return [];
  const scored: { country: Country; score: number }[] = [];
  for (const country of COUNTRIES) {
    const name = fold(country.name);
    const aliases = country.aliases.map(fold);
    let score = 0;
    if (name === q || aliases.includes(q)) score = 6;
    else if (country.iso2.toLowerCase() === q || country.iso3.toLowerCase() === q) score = 5;
    else if (name.startsWith(q)) score = 4;
    else if (aliases.some((a) => a.startsWith(q))) score = 3;
    else if (name.includes(q)) score = 2;
    else if (aliases.some((a) => a.includes(q))) score = 1;
    if (score > 0) scored.push({ country, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.country.name.localeCompare(b.country.name, "en"))
    .slice(0, limit)
    .map((s) => s.country);
}
