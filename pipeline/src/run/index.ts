/**
 * Pipeline entry point.
 *   npm run pipeline:dry      → sample brief for the app, no network, no AI
 *   npm run pipeline:ingest   → real news: GDELT + curated feeds → events → chapters (report only, M3)
 * The AI step that turns events into the app's brief is added in Milestone 4.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_GDELT_OPTIONS, GdeltSource } from "../sources/gdelt";
import { RssSource } from "../sources/rss";
import { runDry } from "./dry";
import { runIngest } from "./ingest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const WEB_DATA = join(ROOT, "web", "public", "data");
const OUT_DIR = join(ROOT, "pipeline", "out");
const CACHE_DIR = join(ROOT, ".cache");

async function main(): Promise<void> {
  if (process.argv.includes("--dry")) {
    const { status, files } = await runDry({ outDir: WEB_DATA });
    console.log(`Dry run finished for ${status.date}. Wrote ${files.length} files to web/public/data/:`);
    for (const file of files) console.log(`  - ${file}`);
    return;
  }

  if (process.argv.includes("--ingest")) {
    const step = Number(process.env.DAWN_GDELT_STEP_MINUTES ?? DEFAULT_GDELT_OPTIONS.stepMinutes);
    const gdelt = new GdeltSource({
      ...DEFAULT_GDELT_OPTIONS,
      stepMinutes: Number.isFinite(step) && step >= 15 ? step : DEFAULT_GDELT_OPTIONS.stepMinutes,
      includeTranslated: process.env.DAWN_GDELT_TRANSLATED !== "0",
    });
    const t0 = Date.now();
    const { status } = await runIngest({
      sources: [gdelt, new RssSource()],
      outDir: OUT_DIR,
      cacheDir: CACHE_DIR,
      log: (m) => {
        console.log(m);
      },
    });
    console.log(
      `Ingest ${status.ok ? "finished" : "FAILED"} in ${((Date.now() - t0) / 1000).toFixed(0)} s: ` +
        `${status.counts.articles} articles, ${status.counts.events} events in chapters, ` +
        `${status.warnings.length} warnings. Report: pipeline/out/report.md`,
    );
    if (!status.ok) process.exitCode = 1;
    return;
  }

  console.error("Usage: tsx src/run/index.ts --dry | --ingest");
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error("Pipeline failed:", error);
  process.exitCode = 1;
});
