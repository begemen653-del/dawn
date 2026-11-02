/**
 * Renders the app icons (PWA manifest, favicon, Apple touch icon) from one SVG.
 * Run with: npx tsx scripts/build-icons.ts   (output is committed)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "web", "public", "icons");

/** A sun rising over the curve of the Earth. `inset` shrinks the artwork for maskable icons. */
function iconSvg(inset: number): string {
  const s = 512;
  const scale = 1 - inset * 2;
  const t = (s * inset).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#070a16"/>
      <stop offset="0.62" stop-color="#151a3a"/>
      <stop offset="1" stop-color="#3a1f4a"/>
    </linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffd27a"/>
      <stop offset="0.55" stop-color="#ff9a62"/>
      <stop offset="1" stop-color="#ff5f8f"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.62" r="0.5">
      <stop offset="0" stop-color="#ff8a6b" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ff8a6b" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="sky"><rect width="${s}" height="350"/></clipPath>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <circle cx="256" cy="318" r="230" fill="url(#glow)"/>
    <circle cx="256" cy="318" r="112" fill="url(#sun)" clip-path="url(#sky)"/>
    <path d="M-400 420 Q256 270 912 420 L912 1000 L-400 1000 Z" fill="#0b1026"/>
    <path d="M-400 420 Q256 270 912 420" fill="none" stroke="#8b7bff" stroke-width="6" stroke-opacity="0.9"/>
    <path d="M60 420 Q256 360 452 420" fill="none" stroke="#8b7bff" stroke-width="3" stroke-opacity="0.35"/>
    <path d="M130 480 Q256 440 382 480" fill="none" stroke="#8b7bff" stroke-width="3" stroke-opacity="0.2"/>
  </g>
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, inset: 0 },
  { file: "icon-512.png", size: 512, inset: 0 },
  { file: "maskable-512.png", size: 512, inset: 0.1 },
  { file: "apple-touch-icon.png", size: 180, inset: 0.04 },
  { file: "favicon-32.png", size: 32, inset: 0 },
] as const;

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, "icon.svg"), iconSvg(0), "utf8");
  for (const { file, size, inset } of TARGETS) {
    await sharp(Buffer.from(iconSvg(inset)))
      .resize(size, size)
      .png()
      .toFile(join(OUT, file));
    console.log(`Wrote web/public/icons/${file}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
