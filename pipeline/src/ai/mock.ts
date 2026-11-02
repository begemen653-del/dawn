import type { z } from "zod";
import type { LlmProvider, LlmRequest, LlmResult } from "./provider";

/**
 * Deterministic stand-in for a real model, used by tests and `--mock` runs. It reads the events
 * in the prompt and writes stories only from the source headlines, so they pass grounding.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  calls = 0;

  generateJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>> {
    this.calls++;
    const reply = request.prompt.includes("### EVENT")
      ? this.stories(request.prompt)
      : this.learn(request.prompt);
    return Promise.resolve({
      value: schema.parse(reply),
      usage: { inputTokens: Math.ceil(request.prompt.length / 4), outputTokens: 300 },
      provider: this.name,
    });
  }

  private stories(prompt: string) {
    const blocks = prompt.split("### EVENT ").slice(1);
    return {
      stories: blocks.map((block) => {
        const id = block.split("\n")[0]?.trim() ?? "";
        const deep = block.includes("Deep: yes");
        const title = /— "(.*)"/.exec(block)?.[1] ?? "News update";
        const countries = [
          ...(/Candidate countries: (.*)/.exec(block)?.[1] ?? "").matchAll(/\b([A-Z]{2}) \(/g),
        ]
          .map((m) => m[1] ?? "")
          .slice(0, 1);
        const places = [...block.matchAll(/^\s+(P\d+): /gm)].map((m) => m[1] ?? "").slice(0, 1);
        return {
          id,
          relevant: true,
          headline: title.slice(0, 90),
          summary: `${title.slice(0, 380)}.`,
          whyItMatters: `${title.slice(0, 380)}.`,
          topic: "other",
          developing: false,
          countries,
          places,
          visual: { kind: "point" },
          deeper: deep
            ? {
                background: `${title}.`,
                keyPlayers: [],
                whatNext: "The sources don't say.",
                timeline: [],
                simpler: `${title}.`,
              }
            : null,
        };
      }),
    };
  }

  private learn(prompt: string) {
    const id = /\[(ev-[a-z0-9]+)\]/.exec(prompt)?.[1] ?? "unknown";
    return {
      title: "Learn something new",
      body: "Each day this card explains one idea behind the news in a few simple sentences.",
      relatedEventId: id,
    };
  }
}
