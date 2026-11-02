import { titleTokens } from "./text";
import type { EventCluster } from "./types";

/** Headline words that mark sport and celebrity items; they rank lower in a world brief. */
const SOFT_NEWS = new Set(
  (
    "football soccer league match goal cup nba nfl fifa uefa transfer coach striker tennis cricket rugby formula " +
    "olympic medal tournament championship playoff celebrity actor actress singer album movie film kardashian " +
    "halloween costume concert band festival oscar grammy premiere reality lottery lotto sorteo resultado " +
    "fussball bundesliga spiel trainer futbol mac gol lig maci"
  ).split(/\s+/),
);

/** GDELT role tags that mark sport and entertainment people. */
const SOFT_THEME =
  /^(SOC_SPORT|TAX_FNCACT_(CHAMPION|SINGER|ACTOR|ACTRESS|ATHLETE|FOOTBALL|SOCCER|COACH|PLAYER|STRIKER|GOALKEEPER|MUSICIAN|RAPPER|CELEBRIT|COMEDIAN|DANCER|BAND|POP_STAR))/;

export function isSoftNews(event: EventCluster): boolean {
  if (event.themes.some((t) => SOFT_THEME.test(t))) return true;
  const words = titleTokens(event.title);
  return words.filter((w) => SOFT_NEWS.has(w)).length >= 1;
}

/**
 * Importance score (0–100). Breadth of independent coverage matters most: distinct headlines
 * (copies of one wire story count once), hand-picked outlets, languages and countries.
 * Recency adds a little; sport and celebrity items are pushed down.
 */
export function scoreEvents(events: EventCluster[], now: Date): EventCluster[] {
  const raw = events.map((e) => {
    const hours = Math.max(0, (now.getTime() - new Date(e.lastSeen).getTime()) / 3_600_000);
    const recency = 1 - Math.min(1, hours / 24);
    const sourceCountries = new Set(e.articles.map((a) => a.sourceCountry).filter(Boolean)).size;
    let s =
      3 * Math.log1p(e.voices) +
      0.5 * Math.log1p(e.outlets.length) +
      2.5 * Math.log1p(e.curatedOutlets) +
      1.5 * Math.log1p(e.languages.length - 1) +
      1.2 * Math.log1p(sourceCountries) +
      1.5 * recency;
    // Soft news can still lead a quiet country chapter, but rarely outranks hard news.
    if (isSoftNews(e)) s *= 0.6;
    return Math.max(0, s);
  });
  const max = Math.max(1e-9, ...raw);
  events.forEach((e, i) => {
    e.score = Math.round(((raw[i] ?? 0) / max) * 1000) / 10;
  });
  return events.sort((a, b) => b.score - a.score);
}
