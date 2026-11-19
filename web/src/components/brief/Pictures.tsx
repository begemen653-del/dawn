"use client";

import type { ImageAsset } from "@dawn/pipeline/schema";
import { Sheet } from "@/components/ui/Sheet";

const PROVIDER_NAME: Record<ImageAsset["provider"], string> = {
  "wikimedia-commons": "Wikimedia Commons",
  openverse: "Openverse",
  nasa: "NASA",
  "nasa-gibs": "NASA GIBS",
  copernicus: "Copernicus",
  "us-gov": "US Government",
  "eu-parliament": "European Parliament",
  "eu-commission": "European Commission",
  ai: "AI illustration",
  map: "Map",
};

/** "Ivar Leidus · CC BY-SA 4.0": the short credit shown under every picture. */
export function shortCredit(image: ImageAsset): string {
  return `${image.author} · ${image.license.name}`;
}

export interface PictureStripProps {
  readonly images: readonly ImageAsset[];
  readonly onOpen: (image: ImageAsset) => void;
}

/**
 * The story's licensed photos. Each shows the whole picture (never cropped: some licenses
 * forbid changes), an "Illustrative" tag and its credit as a caption. Tap for the full credit.
 */
export function PictureStrip({ images, onOpen }: PictureStripProps) {
  return (
    <>
      {images.map((image) => (
        <button
          key={image.id}
          type="button"
          onClick={() => {
            onOpen(image);
          }}
          aria-label={`Photo: ${image.alt}. ${shortCredit(image)}. Show credit`}
          className="group w-40 shrink-0 snap-start overflow-hidden rounded-lg border border-line bg-surface/90 text-left transition-colors hover:border-line-strong lg:w-full"
        >
          <span className="relative block h-20 bg-ground lg:h-28">
            {/* eslint-disable-next-line @next/next/no-img-element -- hotlinked as-is from the provider (licence terms); no resizing service in a static app */}
            <img
              src={image.thumbUrl}
              alt=""
              loading="lazy"
              decoding="async"
              crossOrigin="anonymous"
              className="h-full w-full object-contain"
            />
            <span className="absolute top-1 left-1 rounded bg-ground/85 px-1.5 py-0.5 text-[0.6rem] leading-none text-ink-muted">
              {image.illustrative ? "Illustrative" : "From the event"}
            </span>
          </span>
          {/* Credit as a caption: the license on its own line so it is never cut off. */}
          <span className="block px-2 py-1 text-[0.65rem] leading-tight text-ink-faint">
            <span className="block truncate">{image.author}</span>
            <span className="block text-ink-muted">{image.license.name}</span>
          </span>
        </button>
      ))}
    </>
  );
}

export interface PictureSheetProps {
  readonly image: ImageAsset | null;
  readonly onClose: () => void;
}

/** One photo, larger, with its full credit: author, license (linked) and the file's page. */
export function PictureSheet({ image, onClose }: PictureSheetProps) {
  return (
    <Sheet open={image !== null} onClose={onClose} title="Photo">
      {image && (
        <div className="no-scrollbar overflow-y-auto px-5 pt-4 pb-6">
          <div className="grid place-items-center rounded-lg bg-ground">
            {/* eslint-disable-next-line @next/next/no-img-element -- same hotlinked thumbnail, shown whole */}
            <img
              src={image.thumbUrl}
              alt={image.alt}
              crossOrigin="anonymous"
              className="max-h-[50dvh] w-full object-contain"
            />
          </div>
          <p className="mt-3 text-sm font-medium text-accent">
            {image.illustrative
              ? "Illustrative image, not from the event"
              : "Photo from the event, by an official photographer"}
          </p>
          <p className="mt-2 text-[0.94rem] leading-relaxed text-ink">{image.alt}</p>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-faint">Photo</dt>
            <dd className="text-ink">{image.author}</dd>
            <dt className="text-ink-faint">License</dt>
            <dd>
              {image.license.url ? (
                <a href={image.license.url} target="_blank" rel="noreferrer" className="text-ink underline">
                  {image.license.name}
                </a>
              ) : (
                <span className="text-ink">{image.license.name}</span>
              )}
            </dd>
            <dt className="text-ink-faint">Source</dt>
            <dd>
              <a href={image.sourceUrl} target="_blank" rel="noreferrer" className="text-ink underline">
                {PROVIDER_NAME[image.provider]}
              </a>
            </dd>
          </dl>
          {image.illustrative && (
            <p className="mt-4 text-xs leading-relaxed text-ink-faint">
              Photos of the actual events stay with the news outlets: open “Go deeper” and use the source
              links to see them.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
