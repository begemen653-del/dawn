/**
 * Pipeline entry point.
 *   npm run pipeline:dry   → sample brief, no network, no AI (Milestone 1)
 * The live run (GDELT + feeds + AI) is added in Milestones 3–4.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runDry } from "./dry";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const OUT_DIR = join(ROOT, "web", "public", "data");

async function main(): Promise<void> {
  const dry = process.argv.includes("--dry");
  if (!dry) {
    console.error("Only --dry is available until Milestone 3. Run: npm run pipeline:dry");
    process.exitCode = 1;
    return;
  }
  const { status, files } = await runDry({ outDir: OUT_DIR });
  console.log(`Dry run finished for ${status.date}. Wrote ${files.length} files to web/public/data/:`);
  for (const file of files) console.log(`  - ${file}`);
}

main().catch((error: unknown) => {
  console.error("Pipeline failed:", error);
  process.exitCode = 1;
});
