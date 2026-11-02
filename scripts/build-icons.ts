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
    <clipPath id="sky"><rect width="${s}" height="300"/></clipPath>
  </defs>
  <rect width="${s}" height="${s}" fill="#0f141b"/>
  <g transform="translate(${t} ${t}) scale(${scale})">
    <circle cx="256" cy="300" r="104" fill="#e6e9ed" clip-path="url(#sky)"/>
    <rect x="96" y="300" width="320" height="10" rx="5" fill="#e3b36a"/>
    <rect x="156" y="342" width="200" height="10" rx="5" fill="#3a4656"/>
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
