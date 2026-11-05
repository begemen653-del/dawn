import type { z } from "zod";
import {
  estimateTokens,
  InvalidOutputError,
  QuotaError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./provider";

/** The run's daily token budget is spent; no more AI calls today. */
export class BudgetExceededError extends Error {
  constructor() {
    super("Daily AI token budget reached");
    this.name = "BudgetExceededError";
  }
}

/** No remaining model accepts a request this big; split it up and try again. */
export class RequestTooLargeError extends Error {
  constructor(tokens: number) {
    super(`Request of ~${tokens} tokens is too big for every remaining model`);
    this.name = "RequestTooLargeError";
  }
}

export interface ChainOptions {
  /** Hard cap on tokens (in + out) for the whole run, to stay inside the free tiers. */
  readonly tokenBudget: number;
  /** Tries per provider on network errors / invalid output before moving on. */
  readonly attemptsPerProvider: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (message: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tries providers in order. A provider whose free quota is used up is skipped for the rest of
 * the run; network errors and invalid JSON are retried with growing pauses, then the next
 * provider is tried. Counts tokens against the daily budget.
 */
export class FallbackChain implements LlmProvider {
  readonly name = "fallback-chain";
  private readonly exhausted = new Set<string>();
  private spent = 0;
  readonly usage = new Map<string, { calls: number; tokens: number }>();

  constructor(
    private readonly providers: readonly LlmProvider[],
    private readonly options: ChainOptions,
  ) {}

  get tokensSpent(): number {
    return this.spent;
  }

  get available(): number {
    return this.providers.filter((p) => !this.exhausted.has(p.name)).length;
  }

  async generateJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>> {
    const estimate = estimateTokens(request.system + request.prompt) + request.maxOutputTokens;
    if (this.spent + estimate > this.options.tokenBudget) throw new BudgetExceededError();
    const sleep = this.options.sleep ?? defaultSleep;
    let lastError: unknown =
      this.available > 0 ? new RequestTooLargeError(estimate) : new Error("No AI provider is configured");

    for (const provider of this.providers) {
      if (this.exhausted.has(provider.name)) continue;
      if (provider.maxRequestTokens !== undefined && estimate > provider.maxRequestTokens) continue;
      for (let attempt = 0; attempt < this.options.attemptsPerProvider; attempt++) {
        if (attempt > 0) await sleep(1500 * 2 ** (attempt - 1));
        try {
          const result = await provider.generateJson(request, schema);
          const tokens = result.usage.inputTokens + result.usage.outputTokens || estimate;
          this.spent += tokens;
          const u = this.usage.get(provider.name) ?? { calls: 0, tokens: 0 };
          this.usage.set(provider.name, { calls: u.calls + 1, tokens: u.tokens + tokens });
          return result;
        } catch (error) {
          lastError = error;
          if (error instanceof QuotaError) {
            // A short "slow down" is worth one wait; a long one means the quota is gone for today.
            if (error.retryAfterSeconds !== undefined && error.retryAfterSeconds <= 65 && attempt === 0) {
              await sleep(error.retryAfterSeconds * 1000);
              continue;
            }
            this.exhausted.add(provider.name);
            this.options.log?.(`${provider.name}: free quota used up, switching provider`);
            break;
          }
          if (!(error instanceof InvalidOutputError))
            this.options.log?.(`${provider.name}: ${String(error)}`);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
