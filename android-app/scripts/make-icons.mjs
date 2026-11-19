// Draws Dawn's Android icons and start-up screens from the web app's logo (web/public/icons/icon.svg):
// launcher icons (old and adaptive), and the dark splash images. Run once after changing the logo:
// `node android-app/scripts/make-icons.mjs`.
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const res = join(import.meta.dirname, "..", "android", "app", "src", "main", "res");
const BG = "#0f141b";

// The logo without its square background: rising sun over the horizon line.
const MARK = `
  <defs><clipPath id="sky"><rect width="512" height="300"/></clipPath></defs>
  <circle cx="256" cy="300" r="104" fill="#e6e9ed" clip-path="url(#sky)"/>
  <rect x="96" y="300" width="320" height="10" rx="5" fill="#e3b36a"/>
  <rect x="156" y="342" width="200" height="10" rx="5" fill="#3a4656"/>`;

/** The mark centred on a square, drawn at `scale` of the square's width (0..1), on `bg` or transparent. */
function svg(scale, bg) {
  const s = 512 * scale;
  const offset = (512 - s) / 2;
  // The mark's own centre is a little below the middle (y≈270 of 512), so lift it.
  const lift = (256 - 270) * scale;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      ${bg ? `<rect width="512" height="512" fill="${bg}"/>` : ""}
      <g transform="translate(${offset} ${offset + lift}) scale(${scale})">${MARK}</g>
    </svg>`,
  );
}

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [name, k] of Object.entries(DENSITY)) {
  const dir = join(res, `mipmap-${name}`);
  const legacy = Math.round(48 * k);
  await sharp(svg(0.86, BG)).resize(legacy, legacy).png().toFile(join(dir, "ic_launcher.png"));
  const round = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${legacy} ${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`,
  );
  await sharp(svg(0.8, BG))
    .resize(legacy, legacy)
    .composite([{ input: round, blend: "dest-in" }])
    .png()
    .toFile(join(dir, "ic_launcher_round.png"));
  // Adaptive icon foreground: 108 dp canvas, only the middle 66 dp is always visible.
  const adaptive = Math.round(108 * k);
  await sharp(svg(0.58, null))
    .resize(adaptive, adaptive)
    .png()
    .toFile(join(dir, "ic_launcher_foreground.png"));
}

// Splash images: keep each file's size, dark background, small logo in the middle.
for (const dir of await readdir(res)) {
  if (!dir.startsWith("drawable")) continue;
  const file = join(res, dir, "splash.png");
  let meta;
  try {
    meta = await sharp(file).metadata();
  } catch {
    continue;
  }
  const { width = 480, height = 800 } = meta;
  const logo = Math.round(Math.min(width, height) * 0.32);
  const mark = await sharp(svg(1, null)).resize(logo, logo).png().toBuffer();
  const out = await sharp({ create: { width, height, channels: 4, background: BG } })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
  await sharp(out).toFile(file);
}
console.log("Icons and splash images written.");
