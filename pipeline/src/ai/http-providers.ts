import type { z } from "zod";
import {
  estimateTokens,
  InvalidOutputError,
  QuotaError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
} from "./provider";

/** Per-model pacing: requests and tokens per minute, so we never trip the free-tier limits. */
export interface ModelLimits {
  readonly requestsPerMinute: number;
  readonly tokensPerMinute: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Spaces requests out to stay under requests/minute and tokens/minute. */
export class RateGate {
  private readonly log: { at: number; tokens: number }[] = [];

  constructor(
    private readonly limits: ModelLimits,
    private readonly now: () => number = Date.now,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  async take(tokens: number): Promise<void> {
    for (;;) {
      const t = this.now();
      while (this.log.length > 0 && t - (this.log[0]?.at ?? 0) >= 60_000) this.log.shift();
      const used = this.log.reduce((sum, e) => sum + e.tokens, 0);
      const fitsRequests = this.log.length < this.limits.requestsPerMinute;
      // A single request bigger than the whole minute budget is let through on an empty window.
      const fitsTokens = used + tokens <= this.limits.tokensPerMinute || this.log.length === 0;
      if (fitsRequests && fitsTokens) {
        this.log.push({ at: t, tokens });
        return;
      }
      const oldest = this.log[0]?.at ?? t;
      await this.wait(Math.max(250, oldest + 60_000 - t + 50));
    }
  }
}

/** Pulls the first JSON object out of a reply (models sometimes wrap it in ``` fences or prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1];
  const candidate = (fenced ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new InvalidOutputError("Reply contained no JSON object");
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as unknown;
  } catch {
    throw new InvalidOutputError("Reply contained malformed JSON");
  }
}

function parseWith<T>(schema: z.ZodType<T>, text: string): T {
  const result = schema.safeParse(extractJson(text));
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new InvalidOutputError(`Reply did not match the schema: ${issues}`);
  }
  return result.data;
}

function retryAfter(res: Response): number | undefined {
  const header = Number(res.headers.get("retry-after"));
  return Number.isFinite(header) && header > 0 ? header : undefined;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Google Gemini via the Gemini Developer API (Google AI Studio key). */
export class GeminiProvider implements LlmProvider {
  readonly name: string;
  readonly maxRequestTokens: number;
  private readonly gate: RateGate;

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    limits: ModelLimits,
  ) {
    this.name = `gemini:${model}`;
    this.gate = new RateGate(limits);
    this.maxRequestTokens = limits.tokensPerMinute;
  }

  async generateJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>> {
    await this.gate.take(estimateTokens(request.system + request.prompt) + request.maxOutputTokens);
    const res = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      { "x-goog-api-key": this.apiKey },
      {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxOutputTokens,
        },
      },
      180_000,
    );
    if (res.status === 429)
      throw new QuotaError(`${this.name}: quota or rate limit reached`, retryAfter(res));
    if (!res.ok) throw new Error(`${this.name}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (text === "")
      throw new InvalidOutputError(
        `${this.name}: empty reply (${data.candidates?.[0]?.finishReason ?? "?"})`,
      );
    return {
      value: parseWith(schema, text),
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      provider: this.name,
    };
  }
}

/** Any OpenAI-compatible chat API: used for Groq and OpenRouter. */
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly maxRequestTokens: number;
  private readonly gate: RateGate;

  constructor(
    label: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    limits: ModelLimits,
  ) {
    this.name = `${label}:${model}`;
    this.gate = new RateGate(limits);
    // Groq's strict JSON mode rejects gpt-oss replies; for those we rely on our own JSON check.
    this.reasoning = model.includes("gpt-oss");
    // Groq refuses any single request above the per-minute token limit (reasoning room included).
    this.maxRequestTokens = limits.tokensPerMinute - (this.reasoning ? 1500 : 0);
  }

  private readonly reasoning: boolean;

  async generateJson<T>(request: LlmRequest, schema: z.ZodType<T>): Promise<LlmResult<T>> {
    await this.gate.take(estimateTokens(request.system + request.prompt) + request.maxOutputTokens);
    const res = await postJson(
      `${this.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        temperature: request.temperature ?? 0.2,
        // Reasoning models (gpt-oss) think before answering: keep that short and leave room for it.
        ...(this.reasoning
          ? { reasoning_effort: "low", max_tokens: request.maxOutputTokens + 1500 }
          : { max_tokens: request.maxOutputTokens, response_format: { type: "json_object" } }),
      },
      180_000,
    );
    if (res.status === 429)
      throw new QuotaError(`${this.name}: quota or rate limit reached`, retryAfter(res));
    if (!res.ok) throw new Error(`${this.name}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (text === "") throw new InvalidOutputError(`${this.name}: empty reply`);
    return {
      value: parseWith(schema, text),
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      provider: this.name,
    };
  }
}
