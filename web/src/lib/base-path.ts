/**
 * Where the app lives on its host. On GitHub Pages that's a folder ("/dawn"), locally the site root ("").
 * Set at build time by DAWN_BASE_PATH (next.config.ts passes it on as NEXT_PUBLIC_BASE_PATH).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** "/data/latest/index.json" → "/dawn/data/latest/index.json" on GitHub Pages. */
export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
