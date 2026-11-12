import { COUNTRIES } from "@dawn/config";
import { fold } from "../events/text";
import type { StoryDraft } from "./drafts";

const NUMBER_WORDS: Readonly<Record<string, string>> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  eleven: "11",
  twelve: "12",
  thirteen: "13",
  fourteen: "14",
  fifteen: "15",
  sixteen: "16",
  seventeen: "17",
  eighteen: "18",
  nineteen: "19",
  twenty: "20",
  thirty: "30",
  forty: "40",
  fifty: "50",
  hundred: "100",
  dozen: "12",
};

/** Words that start many names but are ordinary English (sentence starts are skipped anyway). */
const COMMON_CAPITALS = new Set(
  (
    "the a an in on at of for and but or if after before while when where why how what who this that these those it " +
    "its his her their our we they he she monday tuesday wednesday thursday friday saturday sunday january february " +
    "march april may june july august september october november december reports officials police government " +
    "president minister prime court parliament army state states union north south east west central"
  ).split(" "),
);

/**
 * Generic institution and role words. Sources are often in other languages ("Senado", "Bundestag"),
 * so the English word can't be found there, yet it isn't a fact the model could invent.
 */
const GENERIC_TITLES = new Set(
  (
    "senate senator senators house congress congressional chamber deputies representatives representative " +
    "party parties democratic democrat democrats republican republicans conservative conservatives labour " +
    "liberal liberals socialist socialists greens governor governors mayor district university college " +
    "ministry ministries minister-president chancellor premier economic economy affairs department council " +
    "committee commission assembly national federal supreme republic kingdom city region regional province " +
    "provincial county international foreign defence defense interior health finance justice education " +
    "election elections opposition coalition cabinet agency authority authorities office secretary spokesperson " +
    "spokesman spokeswoman embassy ambassador general military forces navy council's " +
    // Common words inside organisation, event and place names ("World Bank", "Olympic Games").
    "world bank people power strait earth saint high security prison correctional service services " +
    "administrative development organization organisation deputy deputies prize award awards year recording " +
    "academy youth games olympic olympics boxing basketball football soccer federation association review " +
    "ministers group company corporation institute foundation center centre league championship festival " +
    "museum hospital airport port river island islands gulf mountain lake valley square street palace " +
    "church cathedral station bridge tower park market exchange stock trade energy nuclear climate human " +
    "rights peace front alliance movement bureau board tribunal prosecutor attorney director chief leader " +
    "commander officer guard coast border customs reserve fund monetary investment workers team club cup"
  ).split(" "),
);

/** Start of every word in every country name and alias: "estoni" covers "Estonian", "Estonia's". */
const COUNTRY_STEMS: readonly string[] = [
  ...new Set(
    COUNTRIES.flatMap((c) => [c.name, ...c.aliases])
      .flatMap((n) => fold(n).split(/[^a-z]+/))
      .filter((w) => w.length >= 4)
      .map((w) => w.slice(0, Math.max(4, w.length - 1))),
  ),
  "americ",
];

/** Nationality or country words ("Estonian", "Kuwaiti") are not facts the model could invent. */
function isCountryWord(word: string): boolean {
  const w = fold(word);
  return COUNTRY_STEMS.some((stem) => w.startsWith(stem));
}

const MULTIPLIERS: Readonly<Record<string, number>> = { thousand: 1e3, million: 1e6, billion: 1e9 };

/** Everything the story may legitimately draw on: source headlines and excerpts. */
export interface Evidence {
  readonly text: string;
  /** Extra allowed names: candidate places and the countries' names in English. */
  readonly names: readonly string[];
}

export interface GroundingResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

/** Ways one written number may appear in a source: "1,200" → "1200", "1.200"; "02" → "2". */
function numberVariants(raw: string): string[] {
  const out = [raw.replace(/[.,](?=\d{3}\b)/g, ""), raw.replace(/,/g, ".")];
  if (/^\d+$/.test(raw)) out.push(String(Number(raw)));
  return out;
}

/** Numbers written as digits, skipping clock minutes ("10:00", "14:30" restate a time). */
function digitGroups(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)*/g)) {
    if (m.index > 0 && text[m.index - 1] === ":" && /^\d{2}$/.test(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

/** Every number a source states, in all its spellings; number words count as their digits. */
function sourceNumbersIn(text: string): Set<string> {
  const out = new Set<string>(digitGroups(text).flatMap(numberVariants));
  // Thousands written with spaces ("120 000", common in European sources).
  for (const m of text.matchAll(/\b\d{1,3}(?:[ \u00a0\u202f]\d{3})+\b/g)) out.add(m[0].replace(/\D/g, ""));
  // "2.5 thousand", "1,2 million".
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s+(thousand|million|billion)\b/gi)) {
    const value = Number((m[1] ?? "").replace(",", ".")) * (MULTIPLIERS[(m[2] ?? "").toLowerCase()] ?? 1);
    if (Number.isFinite(value)) out.add(String(Math.round(value)));
  }
  for (const w of fold(text).split(/[^a-z]+/)) {
    const n = NUMBER_WORDS[w];
    if (n) out.add(n);
  }
  return out;
}

/** Capitalized words that are not the first word of a sentence: likely names. */
function namesIn(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:;])\s+|\n/)) {
    const words = sentence.split(/\s+/).slice(1);
    for (const raw of words) {
      const cleaned = raw
        .replace(/[’‘`]/gu, "'")
        .replace(/[\u2010-\u2015]/gu, "-")
        .replace(/[^\p{L}'-]/gu, "")
        .replace(/'s?$/u, "");
      // "Saudi-led", "Prize-winning": each capitalized part is checked on its own.
      for (const w of cleaned.split("-")) {
        if (w.length < 4 || !/^\p{Lu}/u.test(w)) continue;
        const lower = w.toLowerCase();
        if (COMMON_CAPITALS.has(lower) || GENERIC_TITLES.has(lower) || isCountryWord(w)) continue;
        out.push(w);
      }
    }
  }
  return out;
}

/**
 * Checks a draft against its sources: every number, every quote and (nearly) every name must be
 * found there. This is the guard against invented facts; failing drafts are retried or dropped.
 */
export function checkGrounding(draft: StoryDraft, evidence: Evidence): GroundingResult {
  const issues: string[] = [];
  const corpus = fold(`${evidence.text} ${evidence.names.join(" ")}`);
  const sourceNumbers = sourceNumbersIn(evidence.text);
  const writing = [
    draft.headline,
    draft.summary,
    draft.whyItMatters,
    ...(draft.deeper
      ? [
          draft.deeper.background,
          draft.deeper.whatNext,
          draft.deeper.simpler,
          ...draft.deeper.keyPlayers.flatMap((p) => [p.name, p.role]),
          ...draft.deeper.timeline.flatMap((t) => [t.date, t.label]),
        ]
      : []),
  ].join("\n");

  for (const raw of new Set(digitGroups(writing))) {
    // Years and small numbers in dates are checked too; any one spelling found in a source is enough.
    const variants = numberVariants(raw);
    if (!variants.some((v) => sourceNumbers.has(v)))
      issues.push(`number "${variants[0]}" is not in the sources`);
  }

  for (const m of writing.matchAll(/[“"]([^”"]{12,})[”"]/g)) {
    const quote = fold(m[1] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!corpus.replace(/\s+/g, " ").includes(quote))
      issues.push(`quote "${m[1] ?? ""}" is not in the sources`);
  }

  // Variants of one name ("Bavaria", "Bavarian") count once.
  const stems = new Map<string, string>();
  for (const name of namesIn(writing)) {
    if (!corpus.includes(fold(name))) stems.set(fold(name).slice(0, 6), name);
  }
  const unknown = [...stems.values()];
  // One unfamiliar capitalized word is tolerated (translations of names, "Kremlin" vs "Kreml").
  if (unknown.length >= 2) issues.push(`names not found in the sources: ${unknown.slice(0, 5).join(", ")}`);

  return { ok: issues.length === 0, issues };
}

/** Allowed names for an event: candidate places plus the English names of candidate countries. */
export function evidenceNames(places: readonly { name: string }[], countries: readonly string[]): string[] {
  const names = places.map((p) => p.name);
  for (const iso2 of countries) {
    const c = COUNTRIES.find((x) => x.iso2 === iso2);
    if (c) names.push(c.name, ...c.aliases.slice(0, 3));
  }
  return names;
}
