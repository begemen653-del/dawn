import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageAsset } from "../schema/image";
import { USER_AGENT } from "../sources/types";
import { verifyLicense } from "./license";

/**
 * Wikimedia Commons (https://commons.wikimedia.org), the main image source.
 * Every file's license, author and description come from the API's `extmetadata`; the
 * thumbnail URL is the one the API recommends (hotlinked, never re-hosted).
 */
const API = "https://commons.wikimedia.org/w/api.php";
/** Wikimedia serves a fixed set of thumbnail widths from cache; 500 is one of them. */
const THUMB_WIDTH = 500;
const MIN_WIDTH = 800;
const CACHE_DAYS = 30;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
/**
 * Left out: photos of people (a stranger's face next to a news story could suggest they are part of
 * it) and nature or museum close-ups (a bird or a skeleton says nothing about a place).
 */
const OFF_TOPIC =
  /\b(portrait|selfie|players?|athletes?|footballers?|singers?|musicians?|trumpeter|guitarist|drummer|dancers?|band|actor|actress|politician|minister|president|model|bride|groom|wedding|man|men|woman|women|girls?|boys?|child|children|kids?|people|person|crowd|protest\w*|soldiers?|police\w*|skeleton|skull|fossil|specimen|bird|insect|butterfly|moth|beetle|spider|flower|fungus|mushroom|lizard|snake|frog|animals?|zoo|gull|stork|heron|duck|shrike|rhinoceros|fish)\b/i;
/** A scientific species name in brackets, e.g. "( Ciconia ciconia )". */
const SPECIES = /\(\s*[A-Z][a-z]+ [a-z]{3,}(?: [a-z]{3,})?\s*\)/;
/**
 * Photos of the event itself are only taken from official photographers who publish under free
 * licenses (heads of state and government, EU institutions, the US government, NASA). Their
 * pictures reach Commons within hours; a random upload claiming a free license is not trusted.
 */
export const OFFICIAL =
  /\b(President of Russia|Kremlin|White House|President of Ukraine|Office of the President of Ukraine|Presidential Office of Ukraine|European Commission|Europäische Kommission|Commission européenne|European Parliament|Council of the European Union|European Council|NATO|U\.?\s?S\.? (Department|Secretary|Army|Navy|Air Force|Marines?|Coast Guard|Embassy|Mission)|Department of (War|Defense|State|Homeland Security)|Secretary of (War|Defense|State)|SECWAR|DVIDS|NASA|Bundesregierung|Prime Minister of|Office of the Prime Minister)\b/i;

interface MetaValue {
  readonly value?: unknown;
}
export interface CommonsPage {
  readonly pageid: number;
  readonly title: string;
  /** Position in the search results (the API lists pages by id). */
  readonly index?: number;
  readonly imageinfo?: readonly {
    readonly thumburl?: string;
    readonly descriptionurl?: string;
    readonly width?: number;
    readonly height?: number;
    readonly mime?: string;
    /** Upload time. */
    readonly timestamp?: string;
    readonly extmetadata?: Readonly<Record<string, MetaValue | undefined>>;
  }[];
}

/** Plain text from the small HTML snippets Commons uses for authors and descriptions. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const meta = (m: Readonly<Record<string, MetaValue | undefined>>, key: string): string => {
  const v = m[key]?.value;
  return typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
};

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** A usable Commons file plus the dates needed to tell an event photo from an archive one. */
export interface Found {
  readonly image: ImageAsset;
  /** When the photo was taken (from the file's metadata), if known. */
  readonly takenAt: string | null;
  /** When it was uploaded to Commons. */
  readonly uploadedAt: string | null;
}

/**
 * One Commons file → a photo Dawn may show, or null. Rejected: licenses outside the allowlist
 * (or name and URL disagreeing), files flagged non-free, files with extra restrictions such as
 * personality or trademark rights, files without a named author (unless public domain),
 * small or portrait images, and anything that isn't a plain photo format.
 * "place" photos also skip people and nature close-ups; "event" photos must come from an
 * official photographer (they usually show the people in the news, which is the point).
 */
export function toFound(page: CommonsPage, mode: "place" | "event" = "place"): Found | null {
  const info = page.imageinfo?.[0];
  const m = info?.extmetadata;
  if (!info?.thumburl || !info.descriptionurl || !m) return null;
  if (!MIMES.has(info.mime ?? "")) return null;
  if ((info.width ?? 0) < MIN_WIDTH || (info.width ?? 0) <= (info.height ?? 0)) return null;
  if (meta(m, "NonFree").toLowerCase() === "true") return null;
  if (plainText(meta(m, "Restrictions")) !== "") return null;

  const licenseName = plainText(meta(m, "LicenseShortName"));
  const licenseUrl = meta(m, "LicenseUrl")
    .replace(/^\/\//, "https://")
    .replace(/^http:/, "https:");
  const license = verifyLicense({ name: licenseName, url: licenseUrl });
  if (!license) return null;

  const artist = plainText(meta(m, "Artist"));
  const credit = plainText(meta(m, "Credit"));
  const author = clip(artist || credit, 200);
  if (author === "" && license !== "public-domain") return null;

  const title = page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
  const description = plainText(meta(m, "ImageDescription"));
  if (mode === "place" && (OFF_TOPIC.test(`${title} ${description}`) || SPECIES.test(description)))
    return null;
  // Official photos show people at events: right as event photos, wrong as "a view of the place".
  const official = OFFICIAL.test(`${artist} ${credit}`);
  if (mode === "event" ? !official : official) return null;
  const alt = clip(description || title, 200);
  const parsed = ImageAsset.safeParse({
    id: `commons-${page.pageid}`,
    kind: "photo",
    thumbUrl: info.thumburl,
    sourceUrl: info.descriptionurl,
    provider: "wikimedia-commons",
    author: author || "Unknown author",
    license: {
      id: license,
      name: clip(licenseName || (license === "public-domain" ? "Public domain" : license), 60),
      ...(licenseUrl.startsWith("https://") ? { url: licenseUrl } : {}),
    },
    alt,
    // Until the AI check confirms a photo shows this exact event, it is illustrative.
    illustrative: true,
  });
  if (!parsed.success) return null;
  const taken = /^\d{4}-\d{2}-\d{2}/.exec(plainText(meta(m, "DateTimeOriginal")))?.[0] ?? null;
  return { image: parsed.data, takenAt: taken, uploadedAt: info.timestamp ?? null };
}

/** The photo alone (see `toFound`). */
export function toAsset(page: CommonsPage, mode: "place" | "event" = "place"): ImageAsset | null {
  return toFound(page, mode)?.image ?? null;
}

export interface CommonsOptions {
  /** Folder for cached search results (persisted between nightly runs). */
  readonly cacheDir: string;
  /** For tests. */
  readonly fetch?: (url: string) => Promise<Response>;
}

interface Cached {
  readonly fetchedAt: string;
  readonly found: Found[];
}

interface SearchOptions {
  readonly mode: "place" | "event";
  /** Newest uploads first instead of best match. */
  readonly newest?: boolean;
  readonly cacheHours: number;
}

/** Wikimedia asks API users to go one request at a time; this also keeps us clear of its rate limit. */
const MIN_GAP_MS = 1200;
const BACKOFF_MS = 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CommonsImages {
  private readonly fetcher: (url: string) => Promise<Response>;
  private queue: Promise<unknown> = Promise.resolve();
  private nextAt = 0;
  /** Searches made this run (after cache hits). */
  requests = 0;

  constructor(private readonly options: CommonsOptions) {
    this.fetcher =
      options.fetch ??
      ((url) => fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) }));
  }

  /** One request at a time, at least MIN_GAP_MS apart; after "too many requests", a long pause. */
  private paced(url: string): Promise<Response> {
    const run = async () => {
      const wait = this.nextAt - Date.now();
      if (wait > 0) await sleep(wait);
      this.requests++;
      try {
        const res = await this.fetcher(url);
        this.nextAt = Date.now() + (res.status === 429 ? BACKOFF_MS : MIN_GAP_MS);
        return res;
      } catch (error) {
        this.nextAt = Date.now() + BACKOFF_MS;
        throw error;
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /**
   * Usable photos taken near a place: Commons' "Quality images" (reviewed by its community
   * for quality and correct descriptions) geotagged within `radiusKm` of the point. Searching
   * by position, not by name, avoids "Washington" turning up photos from Washington State.
   */
  async near(at: readonly [number, number], radiusKm: number): Promise<Found[]> {
    const lat = at[1].toFixed(2);
    const lon = at[0].toFixed(2);
    const km = Math.round(Math.min(500, Math.max(5, radiusKm)));
    return this.search(`incategory:Quality_images nearcoord:${km}km,${lat},${lon} filetype:bitmap`, {
      mode: "place",
      cacheHours: CACHE_DAYS * 24,
    });
  }

  /** The newest official photos mentioning all of these words (names from a headline). */
  async recent(terms: readonly string[]): Promise<Found[]> {
    const words = terms.map((t) => t.replace(/["\\]/g, "").trim()).filter((t) => t !== "");
    if (words.length === 0) return [];
    const query = words.map((w) => (w.includes(" ") ? `"${w}"` : w)).join(" ");
    // News moves: look again after a few hours.
    return this.search(`${query} filetype:bitmap`, { mode: "event", newest: true, cacheHours: 6 });
  }

  async search(query: string, options: SearchOptions): Promise<Found[]> {
    const key = createHash("sha1")
      .update(`${options.mode}|${options.newest ? "new" : "best"}|${query}`)
      .digest("hex")
      .slice(0, 16);
    const file = join(this.options.cacheDir, "images", `commons-${key}.json`);
    if (existsSync(file)) {
      try {
        const cached = JSON.parse(await readFile(file, "utf8")) as Cached;
        if (Date.now() - Date.parse(cached.fetchedAt) < options.cacheHours * 3_600_000) {
          return cached.found.flatMap((f) => {
            const ok = ImageAsset.safeParse(f.image);
            return ok.success ? [{ image: ok.data, takenAt: f.takenAt, uploadedAt: f.uploadedAt }] : [];
          });
        }
      } catch {
        // Unreadable cache entry: fetch again.
      }
    }

    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      // Ask the servers to refuse when they're busy rather than add load.
      maxlag: "5",
      generator: "search",
      gsrnamespace: "6",
      gsrlimit: "12",
      gsrsearch: query,
      ...(options.newest ? { gsrsort: "create_timestamp_desc" } : {}),
      prop: "imageinfo",
      iiprop: "url|extmetadata|size|mime|timestamp",
      iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatafilter:
        "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|Restrictions|NonFree|DateTimeOriginal",
      iiextmetadatalanguage: "en",
    });
    const res = await this.paced(`${API}?${params.toString()}`);
    if (!res.ok) throw new Error(`Commons HTTP ${res.status}`);
    const json = (await res.json()) as { query?: { pages?: CommonsPage[] }; error?: { code?: string } };
    if (json.error) throw new Error(`Commons error ${json.error.code ?? "?"}`);
    // The search order is the relevance order; the API returns pages by id, so re-sort.
    const pages = [...(json.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const found = pages.flatMap((p) => toFound(p, options.mode) ?? []);
    await mkdir(join(this.options.cacheDir, "images"), { recursive: true });
    await writeFile(file, JSON.stringify({ fetchedAt: new Date().toISOString(), found } satisfies Cached));
    return found;
  }
}
