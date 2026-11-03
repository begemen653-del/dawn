import { FallbackChain } from "./chain";
import { GeminiProvider, OpenAiCompatibleProvider, type ModelLimits } from "./http-providers";
import type { LlmProvider } from "./provider";

/**
 * Free-tier models, in order of preference. Model names and limits change often, so each list
 * can be overridden with an environment variable (comma-separated) without touching code.
 * Limits here are deliberately conservative; the chain also switches model on any 429.
 * Checked with `npm run pipeline:check-ai` on 2026-11-03 (run it again when a model disappears).
 */
const GEMINI_DEFAULT = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
const GROQ_DEFAULT = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
const OPENROUTER_DEFAULT = ["google/gemma-4-31b-it:free"];

const GEMINI_LIMITS: ModelLimits = { requestsPerMinute: 8, tokensPerMinute: 200_000 };
const GROQ_LIMITS: Record<string, ModelLimits> = {
  "openai/gpt-oss-120b": { requestsPerMinute: 25, tokensPerMinute: 7_500 },
  "qwen/qwen3.8-27b": { requestsPerMinute: 25, tokensPerMinute: 5_800 },
  "openai/gpt-oss-20b": { requestsPerMinute: 25, tokensPerMinute: 7_500 },
};
const OPENROUTER_LIMITS: ModelLimits = { requestsPerMinute: 15, tokensPerMinute: 100_000 };

function list(value: string | undefined, fallback: readonly string[]): string[] {
  const items = value
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items && items.length > 0 ? items : [...fallback];
}

export interface AiSetup {
  readonly chain: FallbackChain;
  readonly providerNames: readonly string[];
  /** The individual models, for health checks. */
  readonly providers: readonly LlmProvider[];
}

/** Builds the provider chain from API keys in the environment (GitHub secrets or .env.local). */
export function chainFromEnv(rawEnv: NodeJS.ProcessEnv, log?: (m: string) => void): AiSetup | null {
  // Keys pasted with a stray space or quotes still work.
  const clean = (v: string | undefined) => {
    const key = v?.trim().replace(/^["']|["']$/g, "");
    return key === "" ? undefined : key;
  };
  const env: NodeJS.ProcessEnv = {
    ...rawEnv,
    GEMINI_API_KEY: clean(rawEnv.GEMINI_API_KEY),
    GROQ_API_KEY: clean(rawEnv.GROQ_API_KEY),
    OPENROUTER_API_KEY: clean(rawEnv.OPENROUTER_API_KEY),
  };
  const providers: LlmProvider[] = [];
  if (env.GEMINI_API_KEY) {
    for (const model of list(env.DAWN_GEMINI_MODELS, GEMINI_DEFAULT)) {
      providers.push(new GeminiProvider(env.GEMINI_API_KEY, model, GEMINI_LIMITS));
    }
  }
  if (env.GROQ_API_KEY) {
    for (const model of list(env.DAWN_GROQ_MODELS, GROQ_DEFAULT)) {
      providers.push(
        new OpenAiCompatibleProvider(
          "groq",
          "https://api.groq.com/openai/v1",
          env.GROQ_API_KEY,
          model,
          GROQ_LIMITS[model] ?? { requestsPerMinute: 25, tokensPerMinute: 9_000 },
        ),
      );
    }
  }
  if (env.OPENROUTER_API_KEY) {
    for (const model of list(env.DAWN_OPENROUTER_MODELS, OPENROUTER_DEFAULT)) {
      providers.push(
        new OpenAiCompatibleProvider(
          "openrouter",
          "https://openrouter.ai/api/v1",
          env.OPENROUTER_API_KEY,
          model,
          OPENROUTER_LIMITS,
        ),
      );
    }
  }
  if (providers.length === 0) return null;
  const budget = Number(env.DAWN_AI_TOKEN_BUDGET ?? 1_500_000);
  const chain = new FallbackChain(providers, {
    tokenBudget: Number.isFinite(budget) && budget > 0 ? budget : 1_500_000,
    attemptsPerProvider: 2,
    ...(log ? { log } : {}),
  });
  return { chain, providerNames: providers.map((p) => p.name), providers };
}
