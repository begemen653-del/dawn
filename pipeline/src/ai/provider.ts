import type { z } from "zod";

export interface LlmRequest {
  readonly system: string;
  readonly prompt: string;
  readonly maxOutputTokens: number;
  readonly temperature?: number;
}

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmResult<T> {
  readonly value: T;
  readonly usage: LlmUsage;
  /** Which provider/model actually answered (after fallbacks). */
  readonly provider: string;
}

/**
 * Provider-agnostic LLM interface. Free-tier implementations (Gemini, Groq, OpenRouter)
 * arrive in Milestone 4. Implementations must validate output against `schema`
 * and throw on invalid JSON so the caller can retry or fall back.
 */
export interface LlmProvider {
  readonly name: string;
  generateJson<T>(request: LlmRequest, schema: z.ZodType<T>, signal?: AbortSignal): Promise<LlmResult<T>>;
}
