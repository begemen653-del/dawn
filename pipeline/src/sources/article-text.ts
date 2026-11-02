import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { fetchWithRetry } from "./http";
import type { PoliteFetcher } from "./http";

/** Longest excerpt per article given to the AI (≈ 450 tokens). */
export const MAX_EXCERPT_CHARS = 1600;

/**
 * Main text of an article page, using Mozilla's Readability (the engine behind Firefox's
 * reader view). Returns null when no article-like text is found (paywalls, video pages).
 */
export function extractArticleText(html: string, url: string): string | null {
  try {
    const { document } = parseHTML(html);
    // Readability resolves links against the page URL.
    Object.defineProperty(document, "documentURI", { value: url });
    const article = new Readability(document, {
      charThreshold: 300,
    }).parse();
    const text = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.length >= 300 ? text : null;
  } catch {
    return null;
  }
}

/** First ~N characters, cut at a sentence end where possible. */
export function excerpt(text: string, maxChars = MAX_EXCERPT_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return lastStop > maxChars * 0.6 ? cut.slice(0, lastStop + 1) : cut;
}

/**
 * Reads an article for summarizing. The text is used only as input for our own short summary;
 * it is never stored in the repo or shown in the app. Respects robots.txt; any failure → null.
 */
export async function readArticle(url: string, fetcher: PoliteFetcher): Promise<string | null> {
  try {
    if (!(await fetcher.isAllowed(url))) return null;
    const res = await fetchWithRetry(url, { headers: { Accept: "text/html" } }, 15_000);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = await res.text();
    const text = extractArticleText(html.slice(0, 2_000_000), url);
    return text ? excerpt(text) : null;
  } catch {
    return null;
  }
}
