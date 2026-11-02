/**
 * Fails if any git-tracked (or staged) file looks like it contains an API key.
 * Runs as part of `npm run check` and in CI. Built output is checked too when present,
 * so keys can never end up in the frontend bundle.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Groq API key", /gsk_[0-9A-Za-z]{40,}/],
  ["OpenRouter API key", /sk-or-(v1-)?[0-9a-f]{32,}/],
  ["OpenAI-style key", /sk-(proj-)?[A-Za-z0-9]{32,}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{36,}/],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|gz)$/i;

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  return out.split("\n").filter((f) => f !== "" && !BINARY.test(f));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : BINARY.test(path) ? [] : [relative(".", path)];
  });
}

const files = [...trackedFiles(), ...(existsSync("web/out") ? walk("web/out") : [])];
const findings: string[] = [];

for (const file of files) {
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(text)) findings.push(`${file}: looks like a ${label}`);
  }
}

if (findings.length > 0) {
  console.error("Possible secrets found — remove them before committing:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`No secrets found in ${files.length} files.`);
}
