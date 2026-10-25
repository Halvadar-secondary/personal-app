// One-off: renders the app icons from one SVG. Re-run after changing the
// design, then commit the PNGs. Usage: pnpm exec tsx scripts/make-icons.ts
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const PURPLE = "#6d4aff";

/** A white mountain with a flag, scaled into the central `inset` share of a 100×100 box. */
function glyph(inset: number): string {
  const s = inset;
  const o = (100 - 100 * s) / 2;
  return `<g transform="translate(${o} ${o}) scale(${s})" fill="#fff">
    <path d="M8 84 L38 36 L52 56 L62 44 L92 84 Z"/>
    <rect x="61" y="14" width="3.5" height="31" rx="1.5"/>
    <path d="M64.5 15 L84 21.5 L64.5 28 Z"/>
  </g>`;
}

function svg(kind: "any" | "maskable"): string {
  const bg =
    kind === "any"
      ? `<rect width="100" height="100" rx="22" fill="${PURPLE}"/>`
      : `<rect width="100" height="100" fill="${PURPLE}"/>`;
  // Maskable icons get cropped to a circle: keep the glyph in the middle 60%.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}${glyph(kind === "any" ? 0.78 : 0.6)}</svg>`;
}

async function render(kind: "any" | "maskable", size: number, out: string) {
  await sharp(Buffer.from(svg(kind)), { density: 1200 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(out);
}

async function main() {
  mkdirSync("public/icons", { recursive: true });
  await render("any", 192, "public/icons/icon-192.png");
  await render("any", 512, "public/icons/icon-512.png");
  await render("maskable", 512, "public/icons/icon-maskable-512.png");
  // iOS rounds the corners itself and shows transparency as black.
  await render("maskable", 180, "src/app/apple-icon.png");
  await render("any", 64, "src/app/icon.png");
}

main();
