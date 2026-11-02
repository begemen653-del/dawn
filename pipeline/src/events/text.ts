/** Text helpers shared by all sources: clean titles, canonical URLs and tokens for clustering. */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X"))
      return safeCodePoint(parseInt(code.slice(2), 16), match);
    if (code.startsWith("#")) return safeCodePoint(parseInt(code.slice(1), 10), match);
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

function safeCodePoint(n: number, fallback: string): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : fallback;
}

/**
 * Cleans a headline: decodes entities, removes tags and a trailing " - Outlet" / " | Outlet",
 * and collapses whitespace.
 */
export function cleanTitle(raw: string, outlet?: string): string {
  let title = decodeEntities(raw)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Strip site names after separators ("Headline – Site – Section"), up to five times.
  const site =
    outlet
      ?.toLowerCase()
      .replace(/^www\./, "")
      .split(".")[0] ?? "";
  for (let i = 0; i < 5; i++) {
    const m = /^(.{20,}?)\s+[-–—|·:]\s+([^-–—|·:]{2,40})$/.exec(title);
    if (!m?.[1] || !m[2]) break;
    const tail = m[2].toLowerCase();
    if ((site !== "" && tail.replace(/\s/g, "").includes(site)) || tail.split(" ").length <= 3) title = m[1];
    else break;
  }
  return title;
}

/** Strips tracking parameters, fragments, "www." and trailing slashes so the same story dedupes. */
export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid|ocid|cmp|ref|at_|ito|xtor|mc_)/i.test(key)) url.searchParams.delete(key);
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString();
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** GDELT reports languages as ISO 639-2/3 codes ("deu"); the app uses ISO 639-1 ("de"). */
const ISO639_3_TO_1: Readonly<Record<string, string>> = {
  eng: "en",
  deu: "de",
  ger: "de",
  tur: "tr",
  fra: "fr",
  fre: "fr",
  spa: "es",
  ita: "it",
  por: "pt",
  nld: "nl",
  dut: "nl",
  rus: "ru",
  ukr: "uk",
  pol: "pl",
  ces: "cs",
  cze: "cs",
  slk: "sk",
  slv: "sl",
  hrv: "hr",
  srp: "sr",
  bos: "bs",
  sqi: "sq",
  alb: "sq",
  ell: "el",
  gre: "el",
  bul: "bg",
  ron: "ro",
  rum: "ro",
  hun: "hu",
  fin: "fi",
  swe: "sv",
  nor: "no",
  nob: "no",
  dan: "da",
  isl: "is",
  est: "et",
  lav: "lv",
  lit: "lt",
  ara: "ar",
  heb: "he",
  fas: "fa",
  per: "fa",
  urd: "ur",
  hin: "hi",
  ben: "bn",
  tam: "ta",
  zho: "zh",
  chi: "zh",
  jpn: "ja",
  kor: "ko",
  vie: "vi",
  tha: "th",
  ind: "id",
  msa: "ms",
  may: "ms",
  tgl: "tl",
  swa: "sw",
  amh: "am",
  kat: "ka",
  hye: "hy",
  arm: "hy",
  aze: "az",
  kaz: "kk",
  uzb: "uz",
  mkd: "mk",
  mac: "mk",
  cat: "ca",
  glg: "gl",
  eus: "eu",
  baq: "eu",
  afr: "af",
  som: "so",
  mon: "mn",
  nep: "ne",
  sin: "si",
  khm: "km",
  lao: "lo",
  mya: "my",
  bur: "my",
  pus: "ps",
  kur: "ku",
};

export function languageFromIso639(code: string): string | null {
  const c = code.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(c)) return c;
  return ISO639_3_TO_1[c] ?? null;
}

/** Lowercase, accents removed: "Türkiye" → "turkiye". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Short, very common words in the main languages; they carry no meaning for grouping stories. */
const STOPWORDS = new Set(
  // English
  (
    "the a an and or but of to in on at for from by with without as is are was were be been being has have had " +
    "will would can could should may might must do does did not no yes this that these those it its into over " +
    "after before about than then there their they them he she his her we our you your who whom which what when " +
    "where why how all any more most other some such only own same so too very just also new says said say " +
    "amid against during under while up down out off again further once here both each few nor now year years " +
    "news live update updates latest report reports video photos watch first last two three one day week " +
    // German
    "der die das den dem des ein eine einer eines und oder aber von zu im in am an auf für mit nach bei aus " +
    "ist sind war wird werden hat haben nicht kein keine sich auch wie was wer wo als um über unter vor " +
    // Turkish
    "ve ile bir bu şu da de mi mu için gibi daha çok en olarak oldu olan ama ancak sonra önce kadar " +
    // French / Spanish / Italian / Portuguese
    "le la les un une des du et ou en au aux pour par sur avec dans est sont pas plus " +
    "el los las del y con por para una uno es son se lo al su sus como más " +
    "il lo gli di da e con per che non sono nel nella alla " +
    "o os as um uma do da dos das no na com por para que não"
  ).split(/\s+/),
);

/** Meaningful words of a title, for grouping articles about the same event. */
export function titleTokens(title: string): string[] {
  const out: string[] = [];
  for (const raw of fold(title).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 3 || STOPWORDS.has(raw) || /^\d+$/.test(raw)) continue;
    // Light plural folding so "elections" and "election" match.
    out.push(raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw);
  }
  return out;
}
