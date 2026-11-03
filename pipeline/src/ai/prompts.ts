import { getCountry } from "@dawn/config";
import { TOPICS } from "../schema";

export interface PlaceCandidate {
  readonly id: string;
  readonly name: string;
  readonly at: readonly [number, number];
  readonly country?: string;
  readonly kind: "city" | "region" | "country";
}

export interface SourceInput {
  readonly outlet: string;
  readonly language: string;
  readonly publishedAt: string;
  readonly title: string;
  readonly url: string;
  /** Short excerpt of the article text, when it could be read. */
  readonly text: string | null;
}

export interface EventInput {
  readonly id: string;
  readonly deep: boolean;
  readonly countries: readonly string[];
  readonly places: readonly PlaceCandidate[];
  readonly sources: readonly SourceInput[];
  /** More headlines about the same event (other outlets), for breadth. */
  readonly otherHeadlines: readonly string[];
}

/** The accuracy rules from the project brief, given to every model on every call. */
export const SYSTEM_PROMPT = `You write Dawn, a calm morning news brief for one reader. You turn news sources into short,
plain-language explanations.

ACCURACY RULES (most important):
1. Use ONLY facts stated in the sources given for that event. No outside knowledge, no guesses.
2. Never invent or change numbers, names, dates, places or quotes. If a detail is not in the sources, leave it out.
3. If sources disagree, say so plainly ("Reports differ on how many people were hurt").
4. On conflicts, politics and accusations, stay neutral and attribute claims ("according to the police",
   "the government says"). Never take a side.
5. If the situation is still unfolding or unclear, set "developing": true and say what is not yet known.
6. Write in your own words. Do not copy sentences. Avoid direct quotes; if one is essential, keep it under 8 words
   and copy it exactly from an English source.
7. If the sources do not describe one clear news event (mixed stories, adverts, lists, horoscopes, lottery
   results, sports fixtures), set "relevant": false and keep the other fields minimal.

STYLE:
- English, simple words, short sentences, for a smart reader who knows nothing about the topic.
- headline: neutral, factual, at most 90 characters, no clickbait.
- summary: 2-3 sentences: what happened, where, and the key detail.
- whyItMatters: 1-2 sentences on the consequence for people, without speculation beyond the sources.
- Sources may be in any language; always answer in English.

PLACES AND COUNTRIES:
- "countries": ISO codes from the event's candidate list that the story is really about (not just mentioned).
- "places": ids (like "P2") from the candidate list, most important first, at most 3. Never invent places.
- "visual.kind": "point" (one place), "route" (movement between two places; set from/to and routeKind),
  "area" (a wide area like a storm or quake zone; set areaKm), or "countries" (a story about whole countries).

GO DEEPER (only when the event says "Deep: yes", otherwise set "deeper": null):
- background (how it started), keyPlayers (name + role), whatNext (only what sources say may happen),
  timeline (only dates found in the sources; empty list if none), simpler (the story for a 12-year-old).
- If the sources don't cover a part, write "The sources don't say." rather than guessing.

OUTPUT: one JSON object with one story per event, using exactly these field names and types.
topic is one of: ${TOPICS.join(", ")}. Leave out from/to/routeKind/areaKm when not used.
keyPlayers is always a list (empty if the sources name nobody); timeline is always a list of {date, label}.
{"stories": [
  {"id": "ev-abc123", "relevant": true, "headline": "...", "summary": "...", "whyItMatters": "...",
   "topic": "politics", "developing": false, "countries": ["DE"], "places": ["P1"],
   "visual": {"kind": "point"},
   "deeper": {"background": "...", "keyPlayers": [{"name": "...", "role": "..."}], "whatNext": "...",
              "timeline": [{"date": "2 November", "label": "..."}], "simpler": "..."}},
  {"id": "ev-def456", "relevant": true, "headline": "...", "summary": "...", "whyItMatters": "...",
   "topic": "disaster", "developing": true, "countries": ["US", "CU"], "places": ["P2", "P1"],
   "visual": {"kind": "route", "from": "P2", "to": "P1", "routeKind": "flight"}, "deeper": null}
]}`;

function countryLabel(iso2: string): string {
  return `${iso2} (${getCountry(iso2)?.name ?? iso2})`;
}

export function renderEvent(e: EventInput): string {
  const lines = [`### EVENT ${e.id}`, `Deep: ${e.deep ? "yes" : "no"}`];
  lines.push(
    `Candidate countries: ${e.countries.length > 0 ? e.countries.map(countryLabel).join(", ") : "none"}`,
  );
  lines.push("Candidate places:");
  for (const p of e.places) lines.push(`  ${p.id}: ${p.name} (${p.kind})`);
  if (e.places.length === 0) lines.push("  none");
  lines.push("Sources:");
  e.sources.forEach((s, i) => {
    lines.push(
      `  [S${i + 1}] ${s.outlet} (${s.language}, ${s.publishedAt.slice(0, 16).replace("T", " ")} UTC) — "${s.title}"`,
    );
    if (s.text) lines.push(`    Text: ${s.text}`);
  });
  if (e.otherHeadlines.length > 0) {
    lines.push("Other headlines about this event:");
    for (const h of e.otherHeadlines) lines.push(`  - ${h}`);
  }
  return lines.join("\n");
}

export function batchPrompt(events: readonly EventInput[], feedback?: string): string {
  return [
    `Write one story for each of these ${events.length} events. Return {"stories": [...]} with exactly ${events.length} items.`,
    ...(feedback ? [`IMPORTANT, fix these problems from your previous answer: ${feedback}`] : []),
    "",
    ...events.map(renderEvent),
  ].join("\n\n");
}

export const LEARN_SYSTEM_PROMPT = `You write the "Learn something new" card of Dawn, a morning news brief.
Pick one of today's stories and explain one background idea that helps understand it (for example what a
central bank does, why a strait matters for shipping, how a parliament forms a government).
Rules: only widely established, uncontroversial facts; no numbers, dates or claims you are not certain of;
no opinions; simple English; 3-5 short sentences. Answer as JSON: {"title": "...", "body": "...", "relatedEventId": "..."}.`;
