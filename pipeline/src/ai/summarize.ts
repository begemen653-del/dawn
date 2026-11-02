import { getCountry } from "@dawn/config";
import type { EventCluster } from "../events/types";
import { StoryEvent, type SourceLink } from "../schema";
import { BudgetExceededError } from "./chain";
import { DraftBatch, type StoryDraft } from "./drafts";
import { checkGrounding, evidenceNames } from "./grounding";
import { batchPrompt, SYSTEM_PROMPT, type EventInput, type PlaceCandidate } from "./prompts";
import type { LlmProvider } from "./provider";
import { estimateTokens } from "./provider";
import { buildScene } from "./scene";

export interface SummarizeOptions {
  /** Events that also get "Go deeper" content. */
  readonly deep: ReadonlySet<string>;
  /** Article excerpts by URL (missing = headline only). */
  readonly texts: ReadonlyMap<string, string>;
  /** Max estimated input tokens per request. */
  readonly maxBatchTokens: number;
  readonly maxBatchSize: number;
  readonly log?: (message: string) => void;
}

export const DEFAULT_SUMMARIZE: Omit<SummarizeOptions, "deep" | "texts"> = {
  maxBatchTokens: 7_000,
  maxBatchSize: 6,
};

export interface SummarizeResult {
  readonly stories: Map<string, StoryEvent>;
  readonly dropped: { readonly id: string; readonly reason: string }[];
  readonly budgetHit: boolean;
}

/** Up to 5 sources from different outlets: readable ones and hand-picked outlets first. */
function pickSources(e: EventCluster, texts: ReadonlyMap<string, string>) {
  const seen = new Set<string>();
  return [...e.articles]
    .sort(
      (a, b) => Number(texts.has(b.url)) - Number(texts.has(a.url)) || Number(b.curated) - Number(a.curated),
    )
    .filter((a) => (seen.has(a.outlet) ? false : (seen.add(a.outlet), true)))
    .slice(0, 5);
}

/** Candidate places: the event's most-mentioned precise places, plus its countries. */
function placeCandidates(e: EventCluster): PlaceCandidate[] {
  const counts = new Map<string, { place: PlaceCandidate; count: number }>();
  for (const a of e.articles) {
    for (const p of a.places) {
      if (p.kind === "country") continue;
      const entry = counts.get(p.name);
      if (entry) entry.count++;
      else
        counts.set(p.name, {
          place: {
            id: "",
            name: p.name,
            at: p.at,
            kind: p.kind,
            ...(p.country ? { country: p.country } : {}),
          },
          count: 1,
        });
    }
  }
  const precise = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((x) => x.place);
  const countries = e.countries.slice(0, 3).flatMap((c) => {
    const country = getCountry(c.iso2);
    return country
      ? [
          {
            id: "",
            name: country.name,
            at: [country.camera.lng, country.camera.lat] as const,
            country: c.iso2,
            kind: "country" as const,
          },
        ]
      : [];
  });
  return [...precise, ...countries].map((p, i) => ({ ...p, id: `P${i + 1}` }));
}

export function buildInput(e: EventCluster, deep: boolean, texts: ReadonlyMap<string, string>): EventInput {
  const sources = pickSources(e, texts);
  const used = new Set(sources.map((s) => s.url));
  return {
    id: e.id,
    deep,
    countries: e.countries.slice(0, 4).map((c) => c.iso2),
    places: placeCandidates(e),
    sources: sources.map((a) => ({
      outlet: a.outlet,
      language: a.language,
      publishedAt: a.publishedAt,
      title: a.title,
      url: a.url,
      text: texts.get(a.url) ?? null,
    })),
    otherHeadlines: e.articles
      .filter((a) => !used.has(a.url))
      .map((a) => a.title)
      .filter((t, i, all) => all.indexOf(t) === i)
      .slice(0, 6),
  };
}

function evidenceFor(input: EventInput) {
  return {
    text: [
      ...input.sources.flatMap((s) => [s.title, s.text ?? "", s.publishedAt.slice(0, 10)]),
      ...input.otherHeadlines,
    ].join("\n"),
    names: evidenceNames(input.places, input.countries),
  };
}

/** Turns an accepted draft into the app's StoryEvent, or explains why it can't be used. */
export function toStory(e: EventCluster, input: EventInput, draft: StoryDraft): StoryEvent | string {
  if (!draft.relevant) return "not a clear news event";
  const allowedCountries = new Set(input.countries);
  const fixed: StoryDraft = { ...draft, countries: draft.countries.filter((c) => allowedCountries.has(c)) };
  const { scene, locations } = buildScene(fixed, input.places, draft.topic);
  if (locations.length === 0) return "no place to show on the globe";

  const sources: SourceLink[] = input.sources.slice(0, 5).map((s) => ({
    outlet: s.outlet.slice(0, 80),
    title: s.title.slice(0, 300),
    url: s.url,
    publishedAt: s.publishedAt,
    language: s.language,
  }));
  if (sources.length < 2) return "fewer than two sources";

  const story = StoryEvent.safeParse({
    id: e.id,
    headline: draft.headline.slice(0, 140),
    summary: draft.summary,
    whyItMatters: draft.whyItMatters,
    topic: draft.topic,
    time: e.lastSeen,
    developing: draft.developing,
    locations,
    sources,
    aiGenerated: true,
    importance: e.score,
    countries: fixed.countries,
    scene,
    images: [],
    deeper: input.deep && draft.deeper ? draft.deeper : null,
  });
  return story.success ? story.data : `invalid story: ${story.error.issues[0]?.message ?? "?"}`;
}

function batches(inputs: readonly EventInput[], maxTokens: number, maxSize: number): EventInput[][] {
  const out: EventInput[][] = [];
  let current: EventInput[] = [];
  let tokens = 0;
  for (const input of inputs) {
    const t = estimateTokens(JSON.stringify(input)) * (input.deep ? 1.3 : 1);
    if (current.length > 0 && (tokens + t > maxTokens || current.length >= maxSize)) {
      out.push(current);
      current = [];
      tokens = 0;
    }
    current.push(input);
    tokens += t;
  }
  if (current.length > 0) out.push(current);
  return out;
}

const outputTokens = (batch: readonly EventInput[]) =>
  batch.reduce((sum, e) => sum + (e.deep ? 900 : 380), 200);

/**
 * Summarizes events in priority order (most important chapters first, so a spent budget only
 * costs the least-viewed chapters). Each draft must pass the schema and the grounding check;
 * failures are retried alone once, with the problems spelled out, then dropped.
 */
export async function summarizeEvents(
  events: readonly EventCluster[],
  llm: LlmProvider,
  options: SummarizeOptions,
): Promise<SummarizeResult> {
  const stories = new Map<string, StoryEvent>();
  const dropped: { id: string; reason: string }[] = [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const inputs = events.map((e) => buildInput(e, options.deep.has(e.id), options.texts));
  const inputById = new Map(inputs.map((i) => [i.id, i]));
  let budgetHit = false;

  const accept = (draft: StoryDraft): string | null => {
    const e = byId.get(draft.id);
    const input = inputById.get(draft.id);
    if (!e || !input) return "unknown id";
    if (draft.relevant) {
      const grounding = checkGrounding(draft, evidenceFor(input));
      if (!grounding.ok) return grounding.issues.join("; ");
    }
    const story = toStory(e, input, draft);
    if (typeof story === "string") {
      dropped.push({ id: draft.id, reason: story });
      return null;
    }
    stories.set(story.id, story);
    return null;
  };

  const retryAlone: { input: EventInput; problem: string }[] = [];
  const all = batches(inputs, options.maxBatchTokens, options.maxBatchSize);
  for (const [i, batch] of all.entries()) {
    try {
      const { value, provider } = await llm.generateJson(
        { system: SYSTEM_PROMPT, prompt: batchPrompt(batch), maxOutputTokens: outputTokens(batch) },
        DraftBatch,
      );
      options.log?.(`AI batch ${i + 1}/${all.length} (${batch.length} events) by ${provider}`);
      const answered = new Set<string>();
      for (const draft of value.stories) {
        if (!inputById.has(draft.id) || answered.has(draft.id)) continue;
        answered.add(draft.id);
        const problem = accept(draft);
        const input = inputById.get(draft.id);
        if (problem && input) retryAlone.push({ input, problem });
      }
      for (const input of batch) {
        if (!answered.has(input.id))
          retryAlone.push({ input, problem: "the story was missing from the answer" });
      }
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        budgetHit = true;
        break;
      }
      options.log?.(`AI batch ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
      for (const input of batch) retryAlone.push({ input, problem: "" });
    }
  }

  for (const { input, problem } of budgetHit ? [] : retryAlone) {
    try {
      const { value } = await llm.generateJson(
        {
          system: SYSTEM_PROMPT,
          prompt: batchPrompt([input], problem === "" ? undefined : problem),
          maxOutputTokens: outputTokens([input]),
        },
        DraftBatch,
      );
      const draft = value.stories.find((d) => d.id === input.id);
      const second = draft ? accept(draft) : "no answer";
      if (second) dropped.push({ id: input.id, reason: second });
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        budgetHit = true;
        break;
      }
      dropped.push({ id: input.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { stories, dropped, budgetHit };
}
