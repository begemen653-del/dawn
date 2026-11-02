import { z } from "zod";
import { HttpUrl, Iso2, IsoDateTime } from "./common";

/**
 * A normalized news article from GDELT or an RSS feed.
 * We keep only metadata and a short snippet for clustering; article text is never republished.
 */
export const Article = z.strictObject({
  id: z.string().min(1),
  url: HttpUrl,
  title: z.string().min(1).max(400),
  outlet: z.string().min(1).max(80),
  language: z.string().regex(/^[a-z]{2}$/),
  publishedAt: IsoDateTime,
  sourceId: z.string().min(1),
  /** Countries the article is about or comes from (ISO2). */
  countries: z.array(Iso2),
  snippet: z.string().max(600).optional(),
});
export type Article = z.infer<typeof Article>;
