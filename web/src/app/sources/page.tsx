import { FEEDS } from "@dawn/config";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Sources & credits" };

/** Each outlet once, with the countries its feeds come from. */
function outlets() {
  const byName = new Map<string, Set<string>>();
  for (const feed of FEEDS) {
    const set = byName.get(feed.outlet) ?? new Set<string>();
    set.add(feed.country);
    byName.set(feed.outlet, set);
  }
  return [...byName.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium tracking-[0.12em] text-ink-faint uppercase">{title}</h2>
      <div className="mt-3 space-y-3 text-[0.94rem] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

function A({ href, children }: { readonly href: string; readonly children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
      {children}
    </a>
  );
}

export default function SourcesPage() {
  const list = outlets();
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-16">
      <Link href="/" className="text-sm text-ink-faint hover:text-ink">
        ← Back to the brief
      </Link>
      <h1 className="mt-6 font-serif text-3xl font-medium text-ink">Sources &amp; credits</h1>
      <p className="mt-3 text-[0.94rem] leading-relaxed text-ink-muted">
        Dawn is a private, non-commercial app. Every story is an AI summary of reports from the outlets below,
        written each night; open “Go deeper” on a story to read the original articles.
      </p>

      <Section title="How the brief is made">
        <p>
          Each night an automated job reads headlines and links from public news feeds and the{" "}
          <A href="https://www.gdeltproject.org/">GDELT Project</A>, groups reports about the same event, and
          asks AI models to summarise them. A fact check drops summaries whose names or numbers do not appear
          in the sources. Article text is never stored or shown.
        </p>
        <p>
          AI models: Google Gemini, and open models served by Groq and OpenRouter. AI can make mistakes; the
          source links are the record.
        </p>
      </Section>

      <Section title={`News outlets (${list.length})`}>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {list.map(([name, countries]) => (
            <li key={name} className="flex justify-between gap-3">
              <span className="text-ink">{name}</span>
              <span className="text-xs text-ink-faint tabular-nums">{[...countries].join(" · ")}</span>
            </li>
          ))}
        </ul>
        <p>
          Plus events from the <A href="https://www.gdeltproject.org/">GDELT Project</A>, which monitors news
          in over 100 languages. Headlines and outlet names belong to their publishers.
        </p>
      </Section>

      <Section title="Photos">
        <p>
          Photos come from <A href="https://commons.wikimedia.org/">Wikimedia Commons</A> under free licences.
          Each photo shows its author and licence; tap it for the full credit and the original file. “From the
          event” photos were taken by official photographers (for example government press offices); all
          others are marked “Illustrative”.
        </p>
      </Section>

      <Section title="Map">
        <p>
          Map tiles: <A href="https://openfreemap.org">OpenFreeMap</A>,{" "}
          <A href="https://www.openmaptiles.org/">© OpenMapTiles</A>, data{" "}
          <A href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</A> (ODbL).
        </p>
        <p>
          Country shapes and place names: <A href="https://www.naturalearthdata.com/">Natural Earth</A>{" "}
          (public domain). Relief shading:{" "}
          <A href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md">
            Terrain Tiles by Mapzen on AWS (SRTM, GMTED, ETOPO1 and others)
          </A>
          . Map drawing: <A href="https://maplibre.org/">MapLibre GL JS</A> (BSD licence).
        </p>
      </Section>

      <Section title="Fonts and icons">
        <p>
          Newsreader and Public Sans (SIL Open Font License). Country flags:{" "}
          <A href="https://github.com/jdecked/twemoji">Twemoji</A> (CC BY 4.0).
        </p>
      </Section>
    </main>
  );
}
