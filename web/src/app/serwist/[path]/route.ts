import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

// Versions the precached offline page; falls back to a random id outside git.
const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();
const revision = gitHead === "" ? randomUUID() : gitHead;

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  swSrc: "src/sw/sw.ts",
  useNativeEsbuild: true,
});
