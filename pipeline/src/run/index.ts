/**
 * Pipeline entry point.
 *   npm run pipeline:dry      → sample brief for the app, no network, no AI
 *   npm run pipeline:ingest   → real news → events → chapters (report only)
 *   npm run pipeline:live     → ingest + AI → the real brief in web/public/data (needs API keys)
 *   npm run pipeline:mock     → ingest + a fake AI (no keys), to test the whole flow
 * API keys come from the environment (GitHub secrets) or a local, git-ignored .env.local file.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chainFromEnv } from "../ai/config";
import { MockLlmProvider } from "../ai/mock";
import type { LlmProvider } from "../ai/provider";
import { DEFAULT_GDELT_OPTIONS, GdeltSource } from "../sources/gdelt";
import { RssSource } from "../sources/rss";
import { runBrief } from "./brief";
import { runDry } from "./dry";
import { runIngest } from "./ingest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WEB_DATA = join(ROOT, "web", "public", "data");
const OUT_DIR = join(ROOT, "pipeline", "out");
const CACHE_DIR = join(ROOT, ".cache");

const log = (m: string) => {
  console.log(m);
};

async function ingest() {
  const step = Number(process.env.DAWN_GDELT_STEP_MINUTES ?? DEFAULT_GDELT_OPTIONS.stepMinutes);
  const gdelt = new GdeltSource({
    ...DEFAULT_GDELT_OPTIONS,
    stepMinutes: Number.isFinite(step) && step >= 15 ? step : DEFAULT_GDELT_OPTIONS.stepMinutes,
    includeTranslated: process.env.DAWN_GDELT_TRANSLATED !== "0",
  });
  const t0 = Date.now();
  const result = await runIngest({
    sources: [gdelt, new RssSource()],
    outDir: OUT_DIR,
    cacheDir: CACHE_DIR,
    log,
  });
  const { status } = result;
  console.log(
    `Ingest ${status.ok ? "finished" : "FAILED"} in ${((Date.now() - t0) / 1000).toFixed(0)} s: ` +
      `${status.counts.articles} articles, ${status.counts.events} events in chapters, ` +
      `${status.warnings.length} warnings. Report: pipeline/out/report.md`,
  );
  return result;
}

/**
 * Node's built-in HTTP client (undici) can hit an internal assertion when a website sends a
 * malformed reply; it fires outside any try/catch and would end the whole run. That one error is
 * logged and ignored (the request still times out normally); anything else still stops the run.
 */
export function isUndiciParserCrash(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: unknown }).code === "ERR_ASSERTION" &&
    (error.stack ?? "").includes("undici")
  );
}

process.on("uncaughtException", (error) => {
  if (isUndiciParserCrash(error)) {
    console.warn("Ignored a malformed reply from a website (Node HTTP client assertion).");
    return;
  }
  console.error("Pipeline crashed:", error);
  process.exit(1);
});

async function main(): Promise<void> {
  const local = join(ROOT, ".env.local");
  if (existsSync(local)) process.loadEnvFile(local);

  if (process.argv.includes("--dry")) {
    const { status, files } = await runDry({ outDir: WEB_DATA });
    console.log(`Dry run finished for ${status.date}. Wrote ${files.length} files to web/public/data/:`);
    for (const file of files) console.log(`  - ${file}`);
    return;
  }

  if (process.argv.includes("--ingest")) {
    const { status } = await ingest();
    if (!status.ok) process.exitCode = 1;
    return;
  }

  if (process.argv.includes("--live") || process.argv.includes("--mock")) {
    let llm: LlmProvider;
    let report = () => "";
    if (process.argv.includes("--mock")) {
      llm = new MockLlmProvider();
    } else {
      const setup = chainFromEnv(process.env, log);
      if (!setup) {
        console.error("No AI keys found. Add GEMINI_API_KEY / GROQ_API_KEY to .env.local or GitHub secrets.");
        process.exitCode = 1;
        return;
      }
      console.log(`AI providers, in order: ${setup.providerNames.join(", ")}`);
      llm = setup.chain;
      report = () =>
        `AI tokens used: ${setup.chain.tokensSpent}. ` +
        [...setup.chain.usage.entries()]
          .map(([k, v]) => `${k} ${v.calls} calls/${v.tokens} tokens`)
          .join(", ");
    }
    const ingested = await ingest();
    if (!ingested.status.ok) {
      process.exitCode = 1;
      return;
    }
    const t0 = Date.now();
    const { status, published } = await runBrief({
      events: ingested.events,
      chapters: ingested.chapters,
      llm,
      outDir: WEB_DATA,
      cacheDir: CACHE_DIR,
      log,
      // DAWN_AI_MAX_EVENTS=40 runs a quick trial on the most important events only.
      ...(Number(process.env.DAWN_AI_MAX_EVENTS) > 0
        ? { maxEvents: Number(process.env.DAWN_AI_MAX_EVENTS) }
        : {}),
    });
    console.log(
      `Brief ${published ? "published" : "NOT published (kept the previous one)"} in ` +
        `${((Date.now() - t0) / 1000).toFixed(0)} s: ${status.counts.events} stories. ${report()}`,
    );
    for (const w of [...status.warnings, ...status.errors]) console.log(`  - ${w}`);
    if (!status.ok) process.exitCode = 1;
    return;
  }

  console.error("Usage: tsx src/run/index.ts --dry | --ingest | --live | --mock");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Pipeline failed:", error);
  process.exitCode = 1;
});
