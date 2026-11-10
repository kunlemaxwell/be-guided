// Be Guided editor kit: turns a raw app screenshot plus a small
// annotation file into the marked-up image used in a guide page (orange
// numbered boxes, optional fade around them, sharp 2x WebP).
// Needs Node 18+ and the "sharp" package (install.sh puts it next to this file).
//
//   node annotate.mjs <spec.json> [<spec.json> ...]
//
// spec.json (kept next to the image, e.g. images/invoice-details.json):
// {
//   "source": "raw/invoice-details.png",   // screenshot, relative to spec
//   "output": "invoice-details.webp",       // written next to the spec
//   "scale": 2,                             // screenshot pixels per CSS px
//   "crop": { "x": 300, "y": 140, "w": 1260, "h": 240 },   // CSS px, optional
//   "dim": true,                            // fade everything outside the boxes
//   "marks": [                              // CSS px of the full screenshot
//     { "n": 1, "box": { "x": 337, "y": 212, "w": 242, "h": 60 } },
//     { "box": { ... } },                   // box without a number = highlight only
//     { "n": 3, "pad": 0, "box": { ... } },   // pad: space around the box (default 6)
//     { "n": 4, "badge": "l", "box": { ... } }, // badge: tr (default) | tl | l | r — where the number sits
//     { "n": 5, "outline": false, "badge": "l", "box": { ... } } // number only, no box
//   Boxes are always outlines, never filled. Mix styles: box + number, number only, or no marks.
//   ]
// }
//
// Because the markings live in this file, a retaken screenshot gets them
// back automatically (the admin app re-runs this after each capture).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ACCENT = '#EA580C'; // orange: readable on light and dark app screens
const MAX_WIDTH = 2880; // output width cap: 2x captures stay full 2x (sharp on retina)
const PAD = 6; // CSS px of breathing room around each box

async function render(specFile) {
  const dir = path.dirname(specFile);
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const scale = spec.scale ?? 2;
  const src = sharp(path.resolve(dir, spec.source));
  const meta = await src.metadata();
  const crop = spec.crop ?? { x: 0, y: 0, w: meta.width / scale, h: meta.height / scale };

  // Work in output pixels from here on.
  const k = Math.min(scale, (MAX_WIDTH / crop.w));
  const W = Math.round(crop.w * k);
  const H = Math.round(crop.h * k);
  const base = await src
    .extract({ left: Math.round(crop.x * scale), top: Math.round(crop.y * scale), width: Math.round(crop.w * scale), height: Math.round(crop.h * scale) })
    .resize(W, H)
    .toBuffer();

  // No blurring: guide screens come from the test environment (house rule).

  const boxes = (spec.marks ?? []).map((m) => {
    const pad = m.pad ?? PAD; // tight pads for elements that touch each other
    return {
      n: m.n,
      badge: m.badge ?? 'tr',
      outline: m.outline !== false,
      x: (m.box.x - crop.x - pad) * k,
      y: (m.box.y - crop.y - pad) * k,
      w: (m.box.w + pad * 2) * k,
      h: (m.box.h + pad * 2) * k,
    };
  });

  const r = 6 * k; // corner radius
  const sw = Math.max(2, 2 * k); // stroke width
  const badge = 13 * k; // badge radius
  const font = 14 * k;

  const holes = boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}" fill="black"/>`).join('');
  const dim = spec.dim && boxes.length
    ? `<mask id="m"><rect width="${W}" height="${H}" fill="white"/>${holes}</mask><rect width="${W}" height="${H}" fill="rgba(15,23,42,0.38)" mask="url(#m)"/>`
    : '';
  const frames = boxes
    .filter((b) => b.outline)
    .map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${r}" fill="none" stroke="${ACCENT}" stroke-width="${sw}"/>`)
    .join('');
  const badges = boxes
    .filter((b) => b.n !== undefined)
    .map((b) => {
      // Default: top-right corner (labels start top-left). "l"/"r" put it beside
      // the box at mid-height — use for stacked items so numbers never touch.
      const pos = {
        tr: [b.x + b.w, b.y],
        tl: [b.x, b.y],
        l: [b.x - badge - 4 * k, b.y + b.h / 2],
        r: [b.x + b.w + badge + 4 * k, b.y + b.h / 2],
      }[b.badge] ?? [b.x + b.w, b.y];
      const cx = Math.max(badge + 2, Math.min(W - badge - 2, pos[0]));
      const cy = Math.max(badge + 2, Math.min(H - badge - 2, pos[1]));
      return `<circle cx="${cx}" cy="${cy}" r="${badge}" fill="${ACCENT}" stroke="#fff" stroke-width="${sw}"/>` +
        `<text x="${cx}" y="${cy}" dy="0.35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="${font}" fill="#fff">${b.n}</text>`;
    })
    .join('');

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs/>${dim}${frames}${badges}</svg>`);
  const out = path.resolve(dir, spec.output);
  await sharp(base).composite([{ input: svg }]).webp({ quality: 88, effort: 5 }).toFile(out);
  // Record the on-screen width (CSS px) so the page shows close-ups at
  // their real size instead of stretching them across the column.
  const sizesFile = path.join(path.dirname(out), '_sizes.json');
  const sizes = fs.existsSync(sizesFile) ? JSON.parse(fs.readFileSync(sizesFile, 'utf8')) : {};
  sizes[path.basename(out)] = Math.round(crop.w);
  fs.writeFileSync(sizesFile, JSON.stringify(sizes, null, 2) + '\n');
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`annotate: ${path.relative(process.cwd(), out)} ${W}×${H} ${kb} KB`);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node annotate.mjs <spec.json> [...]');
  process.exit(1);
}
for (const f of files) await render(f);
