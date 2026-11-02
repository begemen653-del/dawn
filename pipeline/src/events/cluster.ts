import { createHash } from "node:crypto";
import type { Article, ArticlePlace } from "../schema";
import { fold, titleTokens } from "./text";
import type { EventCluster } from "./types";

export interface ClusterOptions {
  /** Cosine similarity needed to join an existing group (0–1). */
  readonly threshold: number;
  /** Articles further apart than this are never the same event. */
  readonly maxGapHours: number;
  /** Cosine similarity between two groups' centres needed to merge them (0–1). */
  readonly mergeThreshold: number;
}

export const DEFAULT_CLUSTER_OPTIONS: ClusterOptions = {
  threshold: 0.38,
  maxGapHours: 36,
  mergeThreshold: 0.45,
};

/** Drops repeats: the same URL, or the same headline from the same site (curated copies win). */
export function dedupe(articles: readonly Article[]): Article[] {
  const sorted = [...articles].sort((a, b) => Number(b.curated) - Number(a.curated));
  const urls = new Set<string>();
  const titles = new Set<string>();
  const out: Article[] = [];
  for (const a of sorted) {
    const titleKey = `${a.domain}|${fold(a.title)}`;
    if (urls.has(a.url) || titles.has(titleKey)) continue;
    urls.add(a.url);
    titles.add(titleKey);
    out.push(a);
  }
  return out;
}

/**
 * Features of an article: headline words, plus the people, organisations and precise places
 * GDELT tagged. The tags are language-neutral, so they also link articles across languages.
 */
export function articleFeatures(a: Article, boilerplate?: ReadonlySet<string>): string[] {
  const features = titleTokens(a.title)
    .filter((t) => !boilerplate?.has(`${a.domain}|${t}`))
    .map((t) => `w:${t}`);
  for (const e of a.entities) features.push(`e:${fold(e)}`);
  for (const p of a.places) if (p.kind !== "country") features.push(`p:${fold(p.name)}`);
  return features;
}

/**
 * Words a site puts in most of its headlines ("Haber Sitesi", "Breaking"): they say nothing about
 * the story and would glue unrelated articles from that site together. Returns "domain|word" keys.
 */
export function siteBoilerplate(articles: readonly Article[]): Set<string> {
  const perSite = new Map<string, { titles: number; words: Map<string, number> }>();
  for (const a of articles) {
    let site = perSite.get(a.domain);
    if (!site) {
      site = { titles: 0, words: new Map() };
      perSite.set(a.domain, site);
    }
    site.titles++;
    for (const t of new Set(titleTokens(a.title))) site.words.set(t, (site.words.get(t) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [domain, site] of perSite) {
    if (site.titles < 4) continue;
    for (const [word, count] of site.words) if (count / site.titles >= 0.6) out.add(`${domain}|${word}`);
  }
  return out;
}

type Vector = Map<string, number>;

interface Group {
  readonly members: Article[];
  readonly sum: Vector;
  normSq: number;
  lastSeen: number;
}

function cosine(v: Vector, g: Group): number {
  if (g.normSq <= 0) return 0;
  let dot = 0;
  for (const [t, w] of v) dot += w * (g.sum.get(t) ?? 0);
  return dot / Math.sqrt(g.normSq);
}

/**
 * Groups articles into events with single-pass ("online") clustering: each article joins the
 * most similar existing group (TF-IDF cosine against the group's centre) or starts a new one.
 * Comparing with the centre, not single members, avoids chains of loosely related stories.
 */
export function clusterArticles(
  articles: readonly Article[],
  options: ClusterOptions = DEFAULT_CLUSTER_OPTIONS,
): EventCluster[] {
  const boilerplate = siteBoilerplate(articles);
  const docs = articles.map((a) => ({ article: a, features: articleFeatures(a, boilerplate) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const f of new Set(d.features)) df.set(f, (df.get(f) ?? 0) + 1);
  const n = Math.max(1, docs.length);
  // Features in more than 3% of all articles ("government", "says") carry little identity.
  const tooCommon = Math.max(25, n * 0.03);

  const vectorOf = (features: readonly string[]): Vector => {
    const v: Vector = new Map();
    for (const f of features) {
      const count = df.get(f) ?? 1;
      if (count > tooCommon) continue;
      const weight = f.startsWith("w:") ? 1 : f.startsWith("e:") ? 1.2 : 0.8;
      v.set(f, (v.get(f) ?? 0) + weight * Math.log((n + 1) / count));
    }
    let norm = 0;
    for (const w of v.values()) norm += w * w;
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  };

  const groups: Group[] = [];
  const index = new Map<string, number[]>();
  const sortedDocs = [...docs].sort((a, b) => a.article.publishedAt.localeCompare(b.article.publishedAt));
  const maxGap = options.maxGapHours * 3_600_000;

  for (const { article, features } of sortedDocs) {
    const v = vectorOf(features);
    if (v.size === 0) continue;
    const time = new Date(article.publishedAt).getTime();

    // Candidates: groups sharing one of the article's strongest features.
    const strongest = [...v.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const candidates = new Set<number>();
    for (const [t] of strongest) for (const gi of index.get(t) ?? []) candidates.add(gi);

    let best = -1;
    let bestScore = options.threshold;
    for (const gi of candidates) {
      const g = groups[gi];
      if (!g || time - g.lastSeen > maxGap) continue;
      const s = cosine(v, g);
      if (s >= bestScore) {
        best = gi;
        bestScore = s;
      }
    }

    let gi = best;
    if (gi < 0) {
      gi = groups.length;
      groups.push({ members: [], sum: new Map(), normSq: 0, lastSeen: time });
    }
    const g = groups[gi];
    if (!g) continue;
    g.members.push(article);
    g.lastSeen = Math.max(g.lastSeen, time);
    for (const [t, w] of v) {
      const old = g.sum.get(t) ?? 0;
      g.normSq += 2 * old * w + w * w;
      g.sum.set(t, old + w);
      if (old === 0) {
        const list = index.get(t);
        if (list) list.push(gi);
        else index.set(t, [gi]);
      }
    }
  }

  return mergeSimilar(groups, options.mergeThreshold).map((g) => toCluster(g, vectorOf));
}

/** Unit-length copy of a group's centre, keeping only its strongest features. */
function centre(g: Group, keep = 30): Vector {
  const norm = Math.sqrt(g.normSq) || 1;
  return new Map(
    [...g.sum.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, keep)
      .map(([t, w]) => [t, w / norm]),
  );
}

/** Keys used to find merge candidates: the six strongest features plus every name, since names are language-neutral. */
function candidateKeys(c: Vector): string[] {
  const entries = [...c.entries()];
  return [
    ...new Set([
      ...entries.slice(0, 6).map(([t]) => t),
      ...entries.filter(([t]) => t.startsWith("e:") || t.startsWith("p:")).map(([t]) => t),
    ]),
  ];
}

/** Similarity of two group centres, and how many named people, organisations and places they share. */
function compare(a: Vector, b: Vector): { dot: number; sharedEntities: number } {
  let dot = 0;
  let sharedEntities = 0;
  for (const [k, w] of a) {
    const ow = b.get(k);
    if (ow === undefined) continue;
    dot += w * ow;
    if (k.startsWith("e:") || k.startsWith("p:")) sharedEntities++;
  }
  return { dot, sharedEntities };
}

/**
 * Second pass: the single pass can split one event in two, for example when reports in two
 * languages use different words. Candidate pairs are merged most-similar first, and every merge
 * is re-checked against the groups as they are now, so a chain of loose resemblances
 * (A like B, B like C) can't snowball into one giant group.
 */
function mergeSimilar(groups: readonly Group[], threshold: number): Group[] {
  const multi: Group[] = groups
    .filter((g) => g.members.length >= 2)
    .map((g) => ({ members: [...g.members], sum: new Map(g.sum), normSq: g.normSq, lastSeen: g.lastSeen }));
  const single = groups.filter((g) => g.members.length < 2);
  // Shared names (people, organisations, places) link reports across languages, whose words differ.
  const passes = (c: { dot: number; sharedEntities: number }) =>
    c.dot >= threshold || (c.sharedEntities >= 2 && c.dot >= 0.2) || (c.sharedEntities >= 3 && c.dot >= 0.12);

  const centres = multi.map((g) => centre(g));
  const index = new Map<string, number[]>();
  centres.forEach((c, i) => {
    for (const t of candidateKeys(c)) {
      const list = index.get(t);
      if (list) list.push(i);
      else index.set(t, [i]);
    }
  });
  const pairs: { i: number; j: number; dot: number }[] = [];
  centres.forEach((c, i) => {
    const seen = new Set<number>();
    for (const t of candidateKeys(c)) {
      for (const j of index.get(t) ?? []) {
        if (j <= i || seen.has(j)) continue;
        seen.add(j);
        const other = centres[j];
        if (!other) continue;
        const result = compare(c, other);
        if (passes(result)) pairs.push({ i, j, dot: result.dot });
      }
    }
  });
  pairs.sort((a, b) => b.dot - a.dot);

  const parent = multi.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] ?? r;
    parent[i] = r;
    return r;
  };
  for (const { i, j } of pairs) {
    const ri = find(i);
    const rj = find(j);
    const a = multi[ri];
    const b = multi[rj];
    if (ri === rj || !a || !b) continue;
    if (!passes(compare(centre(a), centre(b)))) continue;
    a.members.push(...b.members);
    a.lastSeen = Math.max(a.lastSeen, b.lastSeen);
    for (const [t, w] of b.sum) {
      const old = a.sum.get(t) ?? 0;
      a.normSq += 2 * old * w + w * w;
      a.sum.set(t, old + w);
    }
    parent[rj] = ri;
  }
  return [...multi.filter((_, i) => find(i) === i), ...single];
}

/** Copies of one wire story share a headline; count each distinct headline as one voice. */
export function voiceKey(a: Article): string {
  return fold(a.title)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, 80);
}

function toCluster(g: Group, vectorOf: (features: readonly string[]) => Vector): EventCluster {
  // Representative headline: closest to the group's centre, English and curated preferred.
  const ranked = g.members
    .map((a) => ({
      a,
      s: cosine(vectorOf(articleFeatures(a)), g) + (a.language === "en" ? 0.15 : 0) + (a.curated ? 0.1 : 0),
    }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a);
  const top = ranked[0];
  const topFeatures = [...g.sum.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t)
    .sort();
  const id = `ev-${createHash("sha1")
    .update(topFeatures.join("|") || (top?.url ?? ""))
    .digest("hex")
    .slice(0, 12)}`;

  // One vote per distinct headline, so 70 copies of a wire story don't outvote everything else.
  const voices = new Map<string, Article>();
  for (const a of ranked) if (!voices.has(voiceKey(a))) voices.set(voiceKey(a), a);
  const total = voices.size;
  const countryCounts = new Map<string, number>();
  for (const a of voices.values())
    for (const c of new Set(a.countries.slice(0, 4))) countryCounts.set(c, (countryCounts.get(c) ?? 0) + 1);
  const countries = [...countryCounts.entries()]
    .map(([iso2, count]) => ({ iso2, weight: count / total }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  const placeCounts = new Map<string, { place: ArticlePlace; count: number }>();
  for (const a of g.members) {
    for (const p of a.places) {
      if (p.kind !== "city") continue;
      const entry = placeCounts.get(p.name);
      if (entry) entry.count++;
      else placeCounts.set(p.name, { place: p, count: 1 });
    }
  }
  const place = [...placeCounts.values()].sort((a, b) => b.count - a.count)[0]?.place ?? null;

  const themeCounts = new Map<string, number>();
  for (const a of g.members) for (const t of a.themes) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);
  const times = g.members.map((a) => a.publishedAt).sort();

  return {
    id,
    title: top?.title ?? "",
    // Distinct headlines first, so the sources shown are different outlets' own reporting.
    articles: [...voices.values(), ...ranked.filter((a) => voices.get(voiceKey(a)) !== a)],
    voices: total,
    curatedOutlets: new Set(g.members.filter((a) => a.curated).map((a) => a.outlet)).size,
    outlets: [...new Set(g.members.map((a) => a.outlet))],
    languages: [...new Set(g.members.map((a) => a.language))],
    countries,
    place,
    themes: [...themeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t),
    firstSeen: times[0] ?? "",
    lastSeen: times.at(-1) ?? "",
    curated: g.members.some((a) => a.curated),
    score: 0,
  };
}
