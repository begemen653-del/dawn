import { z } from "zod";
import { HttpUrl, Iso2, IsoDateTime, LngLat } from "./common";

/** A place an article mentions (from GDELT's location tagging). */
export const ArticlePlace = z.strictObject({
  name: z.string().min(1).max(120),
  at: LngLat,
  country: Iso2.optional(),
  /** "country" = only the country is named; "city" = a city or landmark (most precise). */
  kind: z.enum(["country", "region", "city"]),
});
export type ArticlePlace = z.infer<typeof ArticlePlace>;

/**
 * A normalized news article from GDELT or an RSS feed.
 * We keep only metadata needed to group and rank stories; article text is never stored or republished.
 */
export const Article = z.strictObject({
  id: z.string().min(1),
  url: HttpUrl,
  title: z.string().min(1).max(400),
  outlet: z.string().min(1).max(80),
  domain: z.string().min(1).max(120),
  language: z.string().regex(/^[a-z]{2}$/),
  publishedAt: IsoDateTime,
  sourceId: z.string().min(1),
  /** Countries the article is about (ISO2), most mentioned first. */
  countries: z.array(Iso2).max(12),
  /** Where the outlet is based, when known (feed config or country web domain). */
  sourceCountry: Iso2.optional(),
  places: z.array(ArticlePlace).max(10),
  /** GDELT theme codes, e.g. "ELECTION", "ECON_INFLATION". */
  themes: z.array(z.string().max(80)).max(20),
  /** People and organisations named, lowercase, language-neutral where GDELT translated them. */
  entities: z.array(z.string().max(80)).max(20),
  /** True for hand-picked, reputable feeds (ranked a little higher). */
  curated: z.boolean(),
});
export type Article = z.infer<typeof Article>;
