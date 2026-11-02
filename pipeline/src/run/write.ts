import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { z } from "zod";

/**
 * Validates `data` against `schema`, then writes it atomically (temp file + rename),
 * so a crash never leaves a half-written file for the app to load.
 */
export async function writeJson<T>(path: string, schema: z.ZodType<T>, data: T): Promise<void> {
  const valid = schema.parse(data);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}
