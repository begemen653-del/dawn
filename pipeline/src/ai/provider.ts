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
 * Provider-agnostic LLM interface. Implementations ask for JSON, validate it against `schema`
 * and throw on invalid output so the caller can retry or fall back.
 */
export interface LlmProvider {
  readonly name: string;
  /** Largest request (input + output tokens) this model accepts; bigger ones go to another model. */
  readonly maxRequestTokens?: number;
  generateJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>>;
}

/** The provider's free quota for this model is used up (for now); try another model. */
export class QuotaError extends Error {
  constructor(
    message: string,
    /** Seconds the provider asked us to wait, when it said so. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "QuotaError";
  }
}

/** The model answered, but not with valid JSON matching the schema. */
export class InvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOutputError";
  }
}

/** Rough token estimate (~4 characters per token for English; a little higher for others). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
