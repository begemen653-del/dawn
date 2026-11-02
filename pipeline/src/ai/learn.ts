import type { LearnCard, StoryEvent } from "../schema";
import { LearnDraft } from "./drafts";
import { LEARN_SYSTEM_PROMPT } from "./prompts";
import type { LlmProvider } from "./provider";

const FALLBACK: LearnCard = {
  title: "Learn something new",
  body: "Today's learning card could not be written. It will be back with tomorrow's brief.",
};

/** The daily "Learn something new" card, tied to one of today's top stories. */
export async function writeLearnCard(top: readonly StoryEvent[], llm: LlmProvider): Promise<LearnCard> {
  if (top.length === 0) return FALLBACK;
  const prompt = [
    "Today's top stories:",
    ...top.slice(0, 6).map((s) => `[${s.id}] ${s.headline} — ${s.summary}`),
    'Pick one and write the card. "relatedEventId" must be one of the ids in brackets.',
  ].join("\n");
  try {
    const { value } = await llm.generateJson(
      { system: LEARN_SYSTEM_PROMPT, prompt, maxOutputTokens: 400, temperature: 0.4 },
      LearnDraft,
    );
    const related = top.some((s) => s.id === value.relatedEventId);
    return {
      title: value.title,
      body: value.body,
      ...(related ? { relatedEventId: value.relatedEventId } : {}),
    };
  } catch {
    return FALLBACK;
  }
}
