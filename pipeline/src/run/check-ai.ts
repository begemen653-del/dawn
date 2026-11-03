/**
 * npm run pipeline:check-ai — which AI models answer right now with your keys?
 * Prints model names and status only, never the keys. Each check costs a few tokens.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { chainFromEnv } from "../ai/config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const local = join(ROOT, ".env.local");
if (existsSync(local)) process.loadEnvFile(local);
const key = (v: string | undefined) => v?.trim().replace(/^["']|["']$/g, "") ?? "";

async function listModels(): Promise<void> {
  const gemini = key(process.env.GEMINI_API_KEY);
  if (gemini) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": gemini },
    });
    const data = res.ok
      ? ((await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] })
      : {};
    const flash = (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /flash/i.test(m.name))
      .map((m) => m.name.replace("models/", ""));
    console.log(`Gemini models available: ${res.ok ? flash.join(", ") : `HTTP ${res.status}`}`);
  }
  const groq = key(process.env.GROQ_API_KEY);
  if (groq) {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${groq}` },
    });
    const data = res.ok ? ((await res.json()) as { data?: { id: string }[] }) : {};
    console.log(
      `Groq models available: ${res.ok ? (data.data ?? []).map((m) => m.id).join(", ") : `HTTP ${res.status}`}`,
    );
  }
}

async function main(): Promise<void> {
  await listModels();
  const setup = chainFromEnv(process.env);
  if (!setup) {
    console.log("No keys found in .env.local or the environment.");
    process.exitCode = 1;
    return;
  }
  const schema = z.object({ ok: z.boolean() });
  for (const provider of setup.providers) {
    try {
      const r = await provider.generateJson(
        { system: "Answer with JSON only.", prompt: 'Reply exactly with {"ok": true}', maxOutputTokens: 30 },
        schema,
      );
      console.log(`✓ ${provider.name} (${r.usage.inputTokens}+${r.usage.outputTokens} tokens)`);
    } catch (error) {
      console.log(
        `✗ ${provider.name}: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`,
      );
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
